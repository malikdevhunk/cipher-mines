// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint32} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title Cipher Mines
/// @notice A push-your-luck minefield where the mine map is generated and kept encrypted on-chain.
///         Nobody (not the player, not the deployer, not a block explorer) can see where the mines are
///         until the round is settled. Every step's outcome and the running score stay encrypted and are
///         readable only by the player. On cash-out the full map and score are publicly decrypted and
///         verified on-chain with the KMS decryption proof, so anyone can audit the round.
/// @author Saddam Malik
contract CipherMines is ZamaEthereumConfig {
    /// @dev 5 x 5 grid, one bit per cell in a 32-bit encrypted word.
    /// @notice Number of cells on the board.
    uint8 public constant GRID_CELLS = 25;
    /// @notice Mask keeping only the 25 grid bits.
    uint32 public constant GRID_MASK = (uint32(1) << GRID_CELLS) - 1;
    /// @notice Maximum number of public leaderboard entries.
    uint8 public constant LEADERBOARD_SIZE = 10;

    enum Risk {
        Low, // each cell is a mine with probability 1/8
        Medium, // 1/4
        High // 3/8
    }

    enum Status {
        None,
        Active,
        Settling,
        Settled
    }

    struct Round {
        Status status;
        Risk risk;
        uint8 steps; // number of cells opened (public: the choices are public, the outcomes are not)
        uint32 opened; // public bitmap of opened cells
        uint64 startedAt;
        euint32 board; // encrypted mine bitmap
        ebool alive; // encrypted: has the player avoided every mine so far?
        ebool lastHit; // encrypted outcome of the latest step
        euint32 score; // encrypted running score
        uint32 revealedBoard; // filled after settlement
        uint32 finalScore; // filled after settlement
    }

    struct Entry {
        address player;
        uint32 score;
        uint8 risk;
        uint8 steps;
        uint64 roundId;
    }

    mapping(address player => Round round) private _rounds;
    /// @notice Number of rounds a player has started.
    mapping(address player => uint64 rounds) public roundCount;
    /// @notice Best settled score per player.
    mapping(address player => uint32 score) public bestScore;
    Entry[] private _leaderboard;

    /// @notice A new encrypted board was generated for `player`.
    /// @param player round owner
    /// @param roundId per-player round number
    /// @param risk risk level
    event RoundStarted(address indexed player, uint64 indexed roundId, Risk risk);
    /// @notice `player` opened `cell`; the outcome stays encrypted.
    /// @param player round owner
    /// @param roundId per-player round number
    /// @param cell opened cell
    /// @param steps cells opened so far
    event CellOpened(address indexed player, uint64 indexed roundId, uint8 cell, uint8 steps);
    /// @notice Score and board were marked publicly decryptable.
    /// @param player round owner
    /// @param roundId per-player round number
    /// @param scoreHandle encrypted score handle
    /// @param boardHandle encrypted board handle
    event CashOutRequested(address indexed player, uint64 indexed roundId, bytes32 scoreHandle, bytes32 boardHandle);
    /// @notice The KMS-verified cleartexts were recorded on-chain.
    /// @param player round owner
    /// @param roundId per-player round number
    /// @param score verified score
    /// @param board verified mine bitmap
    /// @param steps cells opened
    event RoundSettled(address indexed player, uint64 indexed roundId, uint32 score, uint32 board, uint8 steps);

    error RoundNotActive();
    error RoundNotSettling();
    error CellOutOfRange();
    error CellAlreadyOpened();
    error NothingOpened();
    error RoundInProgress();

    /// @notice Points for the k-th safe cell = pointsPerStep(risk) * k. Riskier boards pay more.
    /// @param risk the board risk level
    /// @return points base points per step
    function pointsPerStep(Risk risk) public pure returns (uint32 points) {
        if (risk == Risk.Low) return 1;
        if (risk == Risk.Medium) return 3;
        return 6;
    }

    /// @notice Start a new round. Any unfinished active round is forfeited.
    /// @param risk the board risk level (Low, Medium, High)
    function startRound(Risk risk) external {
        Round storage r = _rounds[msg.sender];
        if (r.status == Status.Settling) revert RoundInProgress();

        // Mine density comes from AND-ing independent encrypted random words:
        // P(bit) = 1/2 per word -> 1/8 for three, 1/4 for two, 3/8 for a & (b | c).
        euint32 a = FHE.randEuint32();
        euint32 b = FHE.randEuint32();
        euint32 board;
        if (risk == Risk.Low) {
            board = FHE.and(FHE.and(a, b), FHE.randEuint32());
        } else if (risk == Risk.Medium) {
            board = FHE.and(a, b);
        } else {
            board = FHE.and(a, FHE.or(b, FHE.randEuint32()));
        }
        board = FHE.and(board, GRID_MASK);

        ebool alive = FHE.asEbool(true);
        euint32 score = FHE.asEuint32(0);

        r.status = Status.Active;
        r.risk = risk;
        r.steps = 0;
        r.opened = 0;
        r.startedAt = uint64(block.timestamp);
        r.board = board;
        r.alive = alive;
        r.lastHit = FHE.asEbool(false);
        r.score = score;
        r.revealedBoard = 0;
        r.finalScore = 0;

        // The board is readable by NOBODY except this contract (for homomorphic ops).
        FHE.allowThis(r.board);
        FHE.allowThis(r.alive);
        FHE.allowThis(r.lastHit);
        FHE.allowThis(r.score);
        FHE.allow(r.alive, msg.sender);
        FHE.allow(r.lastHit, msg.sender);
        FHE.allow(r.score, msg.sender);

        roundCount[msg.sender] += 1;
        emit RoundStarted(msg.sender, roundCount[msg.sender], risk);
    }

    /// @notice Open a cell. The outcome is computed under encryption; only the player can decrypt it.
    /// @param cell index 0..24 (row * 5 + column)
    function openCell(uint8 cell) external {
        Round storage r = _rounds[msg.sender];
        if (r.status != Status.Active) revert RoundNotActive();
        if (cell >= GRID_CELLS) revert CellOutOfRange();
        uint32 bit = uint32(1) << cell;
        if (r.opened & bit != 0) revert CellAlreadyOpened();

        r.opened |= bit;
        r.steps += 1;

        ebool isMine = FHE.ne(FHE.and(r.board, bit), uint32(0));
        ebool aliveAfter = FHE.and(r.alive, FHE.not(isMine));
        // k-th safe step pays pointsPerStep * k; any mine wipes the round to zero.
        euint32 reward = FHE.add(r.score, pointsPerStep(r.risk) * uint32(r.steps));
        r.score = FHE.select(aliveAfter, reward, FHE.asEuint32(0));
        r.alive = aliveAfter;
        r.lastHit = isMine;

        FHE.allowThis(r.score);
        FHE.allowThis(r.alive);
        FHE.allowThis(r.lastHit);
        FHE.allow(r.score, msg.sender);
        FHE.allow(r.alive, msg.sender);
        FHE.allow(r.lastHit, msg.sender);

        emit CellOpened(msg.sender, roundCount[msg.sender], cell, r.steps);
    }

    /// @notice End the round: score and mine map become publicly decryptable for verification.
    function cashOut() external {
        Round storage r = _rounds[msg.sender];
        if (r.status != Status.Active) revert RoundNotActive();
        if (r.steps == 0) revert NothingOpened();
        r.status = Status.Settling;
        FHE.makePubliclyDecryptable(r.score);
        FHE.makePubliclyDecryptable(r.board);
        emit CashOutRequested(msg.sender, roundCount[msg.sender], FHE.toBytes32(r.score), FHE.toBytes32(r.board));
    }

    /// @notice Anyone can settle a round by relaying the KMS public decryption of (score, board).
    /// @param player the round owner
    /// @param abiEncodedClearValues abi.encode(uint32 score, uint32 board) as returned by the relayer
    /// @param decryptionProof KMS signatures over the cleartexts
    function settle(address player, bytes calldata abiEncodedClearValues, bytes calldata decryptionProof) external {
        Round storage r = _rounds[player];
        if (r.status != Status.Settling) revert RoundNotSettling();

        bytes32[] memory handles = new bytes32[](2);
        handles[0] = FHE.toBytes32(r.score);
        handles[1] = FHE.toBytes32(r.board);
        FHE.checkSignatures(handles, abiEncodedClearValues, decryptionProof);

        (uint32 score, uint32 board) = abi.decode(abiEncodedClearValues, (uint32, uint32));
        r.status = Status.Settled;
        r.finalScore = score;
        r.revealedBoard = board;

        if (score > bestScore[player]) bestScore[player] = score;
        _insertLeaderboard(Entry(player, score, uint8(r.risk), r.steps, roundCount[player]));

        emit RoundSettled(player, roundCount[player], score, board, r.steps);
    }

    function _insertLeaderboard(Entry memory e) private {
        if (e.score == 0) return;
        uint256 len = _leaderboard.length;
        if (len == LEADERBOARD_SIZE && _leaderboard[len - 1].score >= e.score) return;
        if (len < LEADERBOARD_SIZE) {
            _leaderboard.push(e);
            len += 1;
        } else {
            _leaderboard[len - 1] = e;
        }
        // single insertion-sort pass (descending)
        for (uint256 i = len - 1; i > 0 && _leaderboard[i].score > _leaderboard[i - 1].score; i--) {
            Entry memory tmp = _leaderboard[i - 1];
            _leaderboard[i - 1] = _leaderboard[i];
            _leaderboard[i] = tmp;
        }
    }

    // ----------------------------------------------------------------- views

    /// @notice Public round metadata.
    /// @param player the round owner
    /// @return status round status
    /// @return risk risk level
    /// @return steps cells opened
    /// @return opened bitmap of opened cells
    /// @return startedAt start timestamp
    /// @return revealedBoard mine bitmap (only after settlement)
    /// @return finalScore verified score (only after settlement)
    function getRound(
        address player
    )
        external
        view
        returns (
            Status status,
            Risk risk,
            uint8 steps,
            uint32 opened,
            uint64 startedAt,
            uint32 revealedBoard,
            uint32 finalScore
        )
    {
        Round storage r = _rounds[player];
        return (r.status, r.risk, r.steps, r.opened, r.startedAt, r.revealedBoard, r.finalScore);
    }

    /// @notice Encrypted handles for the player's round (decryptable by the player only, except `board`).
    /// @param player the round owner
    /// @return board encrypted mine bitmap
    /// @return alive encrypted alive flag
    /// @return lastHit encrypted outcome of the last step
    /// @return score encrypted running score
    function getHandles(
        address player
    ) external view returns (euint32 board, ebool alive, ebool lastHit, euint32 score) {
        Round storage r = _rounds[player];
        return (r.board, r.alive, r.lastHit, r.score);
    }

    /// @notice Top settled scores, highest first.
    /// @return entries leaderboard entries
    function getLeaderboard() external view returns (Entry[] memory entries) {
        return _leaderboard;
    }
}
