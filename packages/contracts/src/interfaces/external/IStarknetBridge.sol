// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

/**
 * @title Starknet canonical bridge (L1) interfaces
 * @notice Minimal surface of the Starknet Core messaging contract and the StarkGate token bridge
 *         used by the pool to deliver the note message and lock value into a destination Starknet
 *         (Cairo) shielded pool.
 * @dev Starknet addresses are field elements (felt252, < ~2**251), not 20-byte EVM addresses, so
 *      the destination pool and the `l1_handler` selector are carried as `uint256`. Message payloads
 *      are `uint256[]` arrays of felts; any value that can exceed the Stark prime (e.g. a
 *      Poseidon-BN254 commitment) must be split into low/high 128-bit felts by the caller.
 * @dev Both operations charge an ETH L1->L2 message fee paid as `msg.value` (the "gas delivery on
 *      destination" open item, in Starknet form).
 */
interface IStarknetMessaging {
  /**
   * @notice Send a message from L1 to an `l1_handler` on a Starknet L2 contract.
   * @param toAddress Destination Starknet contract address (felt252)
   * @param selector The `l1_handler` function selector (felt252)
   * @param payload The message payload as an array of felts
   * @return _msgHash The message hash
   * @return _nonce The message nonce
   */
  function sendMessageToL2(
    uint256 toAddress,
    uint256 selector,
    uint256[] calldata payload
  ) external payable returns (bytes32 _msgHash, uint256 _nonce);
}

interface IStarkgateBridge {
  /**
   * @notice Deposit `amount` of `token` to `l2Recipient` on Starknet via StarkGate.
   * @dev ERC20 path only. StarkGate identifies the native asset with its own sentinel
   *      (`0x...455448`), NOT this repo's `Constants.NATIVE_ASSET` (`0xEeee...EEeE`) — passing the
   *      latter reverts with `TOKEN_NOT_SERVICED`. Use {IStarkgateEthBridge} for native instead.
   * @param token L1 token address
   * @param amount Token amount to bridge
   * @param l2Recipient Destination Starknet address (felt252)
   */
  function deposit(address token, uint256 amount, uint256 l2Recipient) external payable;
}

interface IStarkgateEthBridge {
  /**
   * @notice Deposit `amount` of native ETH to `l2Recipient` on Starknet via the StarkGate ETH bridge.
   * @dev The token-less overload exposed by `StarkWare_StarknetEthBridge_2.0`. The bridged value and
   *      the L1->L2 message fee both ride in `msg.value` (`msg.value == amount + fee`). This avoids
   *      the token-sentinel mismatch described in {IStarkgateBridge.deposit}.
   * @param amount ETH amount to bridge
   * @param l2Recipient Destination Starknet address (felt252)
   */
  function deposit(uint256 amount, uint256 l2Recipient) external payable;
}
