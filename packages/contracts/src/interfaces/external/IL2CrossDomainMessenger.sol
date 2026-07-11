// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

/**
 * @title IL2CrossDomainMessenger
 * @notice Minimal view surface of the OP-Stack L2 cross-domain messenger used to authenticate
 *         messages delivered from L1. When the messenger relays an L1->L2 message, the target can
 *         read the original L1 sender via `xDomainMessageSender()`.
 */
interface IL2CrossDomainMessenger {
  /**
   * @notice The L1 address that dispatched the message currently being relayed
   * @return _sender The L1 sender address (address(0) outside of a relay)
   */
  function xDomainMessageSender() external view returns (address _sender);
}
