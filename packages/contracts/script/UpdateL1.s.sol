// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {Constants} from "contracts/lib/Constants.sol";
import {Entrypoint} from "contracts/Entrypoint.sol";
import {IERC20} from "@oz/interfaces/IERC20.sol";

/**
 *  @notice Operational updates for a deployed L1 Privacy Pools Entrypoint.
 */
contract UpdateL1Root is Script {
    function run() external {
        Entrypoint _entrypoint = Entrypoint(payable(vm.envAddress("ENTRYPOINT_ADDRESS")));
        address _postman = vm.envAddress("POSTMAN_ADDRESS");
        uint256 _root = vm.envUint("ASP_ROOT");
        string memory _ipfsCID = vm.envString("ASP_IPFS_CID");

        if (_root == 0) revert("ASP_ROOT must be non-zero");

        vm.startBroadcast(_postman);
        uint256 _index = _entrypoint.updateRoot(_root, _ipfsCID);
        vm.stopBroadcast();

        console.log("L1 ASP root updated at index:", _index);
        console.log("Root:", _root);
    }
}

/**
 *  @notice Update the minimum deposit and fee configuration for an L1 asset.
 */
contract UpdateL1PoolConfiguration is Script {
    function run() external {
        Entrypoint _entrypoint = Entrypoint(payable(vm.envAddress("ENTRYPOINT_ADDRESS")));
        address _owner = vm.envAddress("OWNER_ADDRESS");
        address _asset = vm.envOr("L1_ASSET_ADDRESS", Constants.NATIVE_ASSET);
        uint256 _minimumDepositWei = vm.envUint("L1_MINIMUM_DEPOSIT_WEI");
        uint256 _vettingFeeBPS = vm.envUint("L1_VETTING_FEE_BPS");
        uint256 _maxRelayFeeBPS = vm.envUint("L1_MAX_RELAY_FEE_BPS");

        vm.startBroadcast(_owner);
        _entrypoint.updatePoolConfiguration(IERC20(_asset), _minimumDepositWei, _vettingFeeBPS, _maxRelayFeeBPS);
        vm.stopBroadcast();

        console.log("L1 pool configuration updated for asset:", _asset);
        console.log("Minimum deposit:", _minimumDepositWei);
        console.log("Vetting fee BPS:", _vettingFeeBPS);
        console.log("Maximum relay fee BPS:", _maxRelayFeeBPS);
    }
}
