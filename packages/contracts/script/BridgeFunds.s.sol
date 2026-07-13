// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {IL1StandardBridge} from "interfaces/external/IOptimismAdapter.sol";

/**
 * @notice Bridge native ETH from Ethereum L1 to a supported OP Stack L2.
 * The recipient is the L2 relayer account that needs native ETH for gas.
 */
contract BridgeFundsToOpStack is Script {
    function run() external {
        string memory _target = vm.envString("L2_TARGET");
        address _bridge = vm.envAddress(string.concat(_target, "_L1_STANDARD_BRIDGE_ADDRESS"));
        address _recipient = vm.envAddress(string.concat(_target, "_RELAYER_ADDRESS"));
        uint32 _gasLimit = uint32(vm.envUint(string.concat(_target, "_BRIDGE_GAS_LIMIT")));
        uint256 _amount = vm.envUint("BRIDGE_AMOUNT_WEI");
        address _sender = vm.envAddress("DEPLOYER_ADDRESS");

        if (_amount == 0) revert("BRIDGE_AMOUNT_WEI must be non-zero");
        if (_recipient == address(0)) revert("L2 relayer recipient must be non-zero");

        vm.startBroadcast(_sender);
        IL1StandardBridge(_bridge).bridgeETHTo{value: _amount}(_recipient, _gasLimit, "");
        vm.stopBroadcast();

        console.log("Bridged native ETH to L2 target:", _target);
        console.log("L1 bridge:", _bridge);
        console.log("L2 recipient:", _recipient);
        console.log("Amount:", _amount);
        console.log("Minimum L2 gas limit:", _gasLimit);
    }
}
