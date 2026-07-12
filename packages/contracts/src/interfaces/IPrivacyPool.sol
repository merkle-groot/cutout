// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {ProofLib} from '../contracts/lib/ProofLib.sol';
import {IState} from 'interfaces/IState.sol';

/**
 * @title IPrivacyPool
 * @notice Interface for the PrivacyPool contract
 * @dev The pool holds its own funds, is deposited into and withdrawn from directly, and
 *      bridges withdrawn value to L2 itself. It reads configuration (fees, ASP root, bridge
 *      config) from the Registry (`ENTRYPOINT`) via view calls; no value routes through the Registry.
 */
interface IPrivacyPool is IState {
  /*///////////////////////////////////////////////////////////////
                              STRUCTS
  //////////////////////////////////////////////////////////////*/

  /**
   * @notice Struct for the withdrawal request
   * @dev The integrity of this data is ensured by the `context` signal in the proof
   * @param chainId The destination chain id to bridge the withdrawn value to
   * @param data Encoded `RelayData`
   */
  struct Withdrawal {
    uint256 chainId;
    bytes data;
  }

  /**
   * @notice Struct for the relay data
   * @param recipient The recipient of the funds withdrawn from the pool
   * @param feeRecipient The recipient of the fee
   * @param ephemeralKey The ephemeral public key E carried with the L2 note for recipient scanning
   * @param viewTag The off-chain scan pre-filter hint (low byte of Poseidon(ss))
   * @param relayFeeBPS The relay fee in basis points
   */
  struct RelayData {
    address recipient;
    address feeRecipient;
    uint256[2] ephemeralKey;
    bytes1 viewTag;
    uint256 relayFeeBPS;
  }

  /*///////////////////////////////////////////////////////////////
                              EVENTS
  //////////////////////////////////////////////////////////////*/

  /**
   * @notice Emitted when making a user deposit
   * @param _depositor The address of the depositor
   * @param _commitment The commitment hash
   * @param _label The deposit generated label
   * @param _value The deposited amount (after vetting fees)
   * @param _precommitmentHash The deposit precommitment hash
   */
  event Deposited(
    address indexed _depositor, uint256 _commitment, uint256 _label, uint256 _value, uint256 _precommitmentHash
  );

  /**
   * @notice Emitted when processing a withdrawal
   * @param _newCommitmentHashL1 The new L1 change-note commitment hash
   * @param _newComitmentHashL2 The bridged L2 destination-note commitment hash (C_dest)
   * @param _value The withdrawn amount
   * @param _spentNullifier The spent nullifier
   */
  event Withdrawn(uint256 _newCommitmentHashL1, uint256 _newComitmentHashL2, uint256 _value, uint256 _spentNullifier);

  /**
   * @notice Emitted when relaying a withdrawal
   * @param _relayer The address of the relayer (caller)
   * @param _recipient The intended recipient of the withdrawal
   * @param _amount The withdrawn amount (before fees)
   * @param _feeAmount The fee paid to the relayer
   */
  event WithdrawalRelayed(address indexed _relayer, address indexed _recipient, uint256 _amount, uint256 _feeAmount);

  /**
   * @notice Emitted alongside a relayed withdrawal to carry the L2 note scanning data
   * @param _newCommitmentHashL2 The bridged L2 destination-note commitment hash (C_dest)
   * @param _ephemeralKey The ephemeral public key E carried with the note for recipient scanning
   * @param _viewTag The off-chain scan pre-filter hint (low byte of Poseidon(ss))
   */
  event L2Note(uint256 indexed _newCommitmentHashL2, uint256[2] _ephemeralKey, bytes1 indexed _viewTag);

  /**
   * @notice Emitted when ragequitting a commitment
   * @param _ragequitter The address who ragequit
   * @param _commitment The ragequit commitment
   * @param _label The commitment label
   * @param _value The ragequit amount
   */
  event Ragequit(address indexed _ragequitter, uint256 _commitment, uint256 _label, uint256 _value);

  /**
   * @notice Emitted when withdrawing accrued fees from the pool
   * @param _recipient The address of the fees withdrawal recipient
   * @param _amount The amount of asset withdrawn
   */
  event FeesWithdrawn(address _recipient, uint256 _amount);

  /**
   * @notice Emitted irreversibly suspending deposits
   */
  event PoolDied();

  /*///////////////////////////////////////////////////////////////
                              ERRORS
  //////////////////////////////////////////////////////////////*/

  /**
   * @notice Thrown when failing to verify a withdrawal proof through the Groth16 verifier
   */
  error InvalidProof();

  /**
   * @notice Thrown when trying to spend a commitment that does not exist in the state
   */
  error InvalidCommitment();

  /**
   * @notice Thrown when calling `withdraw` with a ASP or state tree depth greater or equal than the max tree depth
   */
  error InvalidTreeDepth();

  /**
   * @notice Thrown when trying to deposit an amount higher than 2**128
   */
  error InvalidDepositValue();

  /**
   * @notice Thrown when providing an invalid context for the pool and withdrawal
   */
  error ContextMismatch();

  /**
   * @notice Thrown when providing an unknown or outdated state root
   */
  error UnknownStateRoot();

  /**
   * @notice Thrown when providing an unknown or outdated ASP root
   */
  error IncorrectASPRoot();

  /**
   * @notice Thrown when trying to ragequit while not being the original depositor
   */
  error OnlyOriginalDepositor();

  /**
   * @notice Thrown when trying to withdraw an invalid (zero) amount
   */
  error InvalidWithdrawalAmount();

  /**
   * @notice Thrown when trying to relay with a relayer fee greater than the maximum configured
   */
  error RelayFeeGreaterThanMax();

  /**
   * @notice Thrown when trying to deposit less than the minimum deposit amount
   */
  error MinimumDepositAmount();

  /**
   * @notice Thrown when trying to deposit using a precommitment that has already been used
   */
  error PrecommitmentAlreadyUsed();

  /**
   * @notice Thrown when the destination chain is not supported by the Registry bridge config
   */
  error UnsupportedChain();

  /**
   * @notice Thrown when the caller-supplied `msg.value` does not cover the required L1->L2
   *         message/gas fees for an Arbitrum or Starknet bridge
   */
  error InsufficientBridgeFee();

  /// @notice Thrown when the proof's destination value does not match the post-fee bridge amount
  error BridgedValueMismatch();

  /**
   * @notice Thrown when the caller is not the Registry owner
   */
  error OnlyRegistryOwner();

  /**
   * @notice Thrown when sending less amount of native asset than required
   */
  error InsufficientValue();

  /**
   * @notice Thrown when failing to send native asset to an account
   */
  error FailedToSendNativeAsset();

  /**
   * @notice Thrown when sending native asset to an ERC20 pool
   */
  error NativeAssetNotAccepted();

  /*///////////////////////////////////////////////////////////////
                              LOGIC
  //////////////////////////////////////////////////////////////*/

  /**
   * @notice Make a native asset deposit into the Privacy Pool
   * @dev Only valid on a native asset pool. Deposited value is `msg.value`.
   * @param _precommitment The precommitment hash
   * @return _commitment The commitment hash
   */
  function deposit(uint256 _precommitment) external payable returns (uint256 _commitment);

  /**
   * @notice Make an ERC20 deposit into the Privacy Pool
   * @dev Only valid on an ERC20 pool. Pulls `_value` from the caller.
   * @param _value The value being deposited
   * @param _precommitment The precommitment hash
   * @return _commitment The commitment hash
   */
  function deposit(uint256 _value, uint256 _precommitment) external returns (uint256 _commitment);

  /**
   * @notice Privately withdraw funds by spending an existing commitment, bridging the value to L2
   * @dev Permissionless; the caller (relayer), fee and destination are bound by the proof `context`.
   * @dev Payable: for Arbitrum/Starknet destinations the caller prepays the L1->L2 message/gas fee
   *      as `msg.value` (any excess is refunded). OP-Stack destinations require no `msg.value`.
   * @param _withdrawal The `Withdrawal` struct
   * @param _proof The `WithdrawProof` struct
   */
  function relay(Withdrawal calldata _withdrawal, ProofLib.WithdrawProof calldata _proof) external payable;

  /**
   * @notice Publicly withdraw funds to original depositor without exposing secrets
   * @dev Only callable by the original depositor
   * @param _p the `RagequitProof` struct
   */
  function ragequit(ProofLib.RagequitProof memory _p) external;

  /**
   * @notice Irreversibly suspends deposits
   * @dev Withdrawals can never be disabled
   * @dev Only callable by the Registry
   */
  function windDown() external;

  /**
   * @notice Withdraw accrued fees (vetting fees) from the pool
   * @dev Only callable by the Registry owner
   * @param _recipient The recipient of the fees
   */
  function withdrawFees(address _recipient) external;
}
