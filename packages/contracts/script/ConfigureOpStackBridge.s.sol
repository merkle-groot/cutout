// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Script} from 'forge-std/Script.sol';
import {console} from 'forge-std/console.sol';

import {Constants} from 'contracts/lib/Constants.sol';
import {Entrypoint} from 'contracts/Entrypoint.sol';
import {IEntrypoint} from 'interfaces/IEntrypoint.sol';

/**
 * @notice Configure an OP Stack L1->L2 bridge for a deployed L1 pool.
 *
 * The bridge contracts are intentionally environment-driven. OP Sepolia and other OP Stack
 * networks must never share hard-coded messenger/bridge addresses in an application script.
 * Run this with the Entrypoint owner account after both pools are deployed.
 */
contract ConfigureOpStackBridge is Script {
  function run() external {
    address _deployer = vm.envAddress('DEPLOYER_ADDRESS');
    Entrypoint _entrypoint = Entrypoint(payable(vm.envAddress('ENTRYPOINT_ADDRESS')));
    string memory _target = vm.envString('L2_TARGET');
    uint256 _destinationChainId = vm.envUint(string.concat(_target, '_CHAIN_ID'));
    address _l1Messenger = vm.envAddress(string.concat(_target, '_L1_MESSENGER_ADDRESS'));
    address _l1TokenBridge = vm.envAddress(string.concat(_target, '_L1_STANDARD_BRIDGE_ADDRESS'));
    address _l2Pool = vm.envAddress(string.concat(_target, '_L2_POOL_ADDRESS'));
    uint256 _messageGasLimit = vm.envUint(string.concat(_target, '_MESSAGE_GAS_LIMIT'));
    uint256 _tokenGasLimit = vm.envUint(string.concat(_target, '_TOKEN_GAS_LIMIT'));

    vm.startBroadcast(_deployer);
    _entrypoint.setBridgeConfig(
      _destinationChainId,
      Constants.NATIVE_ASSET,
      IEntrypoint.BridgeConfig({
        kind: IEntrypoint.BridgeKind.OpStack,
        isSupported: true,
        l1Messenger: _l1Messenger,
        l1TokenBridge: _l1TokenBridge,
        l2Pool: _l2Pool,
        l2PoolFelt: 0,
        l2Handler: 0,
        l2Token: address(0),
        messageGasLimit: _messageGasLimit,
        messageMaxFeePerGas: 0,
        messageFee: 0,
        tokenGasLimit: _tokenGasLimit,
        tokenMaxFeePerGas: 0,
        tokenFee: 0
      })
    );
    vm.stopBroadcast();

    console.log('Configured OP Stack bridge for destination chain:', _destinationChainId);
    console.log('L2 pool:', _l2Pool);
  }
}
