// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Script} from 'forge-std/Script.sol';
import {console} from 'forge-std/console.sol';
import {VmSafe} from 'forge-std/Vm.sol';

import {Constants} from 'contracts/lib/Constants.sol';
import {L2PrivacyPool} from 'contracts/L2/L2PrivacyPool.sol';
import {L2WithdrawalVerifier} from 'contracts/verifiers/L2WithdrawalVerifier.sol';

/**
 * @notice Deploy the destination-side Mode-3 pool on an OP Stack L2.
 *
 * Required environment:
 * - DEPLOYER_ADDRESS
 * - L1_POOL_ADDRESS
 * - L2_TARGET (for example, OP_SEPOLIA)
 * - <L2_TARGET>_L2_MESSENGER_ADDRESS
 *
 * Optional environment:
 * - L2_ASSET_ADDRESS (defaults to the native asset sentinel)
 * - L2_MAX_RELAY_FEE_BPS (defaults to 100)
 */
contract DeployL2Testnet is Script {
  function run() external returns (address _pool, address _verifier) {
    address _deployer = vm.envAddress('DEPLOYER_ADDRESS');
    address _l1Pool = vm.envAddress('L1_POOL_ADDRESS');
    string memory _target = vm.envString('L2_TARGET');
    address _messenger = vm.envAddress(string.concat(_target, '_L2_MESSENGER_ADDRESS'));
    address _asset = vm.envOr(string.concat(_target, '_L2_ASSET_ADDRESS'), Constants.NATIVE_ASSET);
    uint256 _maxRelayFeeBPS = vm.envOr(string.concat(_target, '_MAX_RELAY_FEE_BPS'), uint256(100));

    require(_deployer != address(0) && _l1Pool != address(0) && _messenger != address(0), 'missing deployment address');

    vm.startBroadcast(_deployer);
    L2WithdrawalVerifier _withdrawalVerifier = new L2WithdrawalVerifier();
    L2PrivacyPool _l2Pool = new L2PrivacyPool(
      _asset,
      _l1Pool,
      _messenger,
      address(_withdrawalVerifier),
      _maxRelayFeeBPS
    );
    vm.stopBroadcast();

    _verifier = address(_withdrawalVerifier);
    _pool = address(_l2Pool);

    if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
      _saveDeploymentData(_pool, _verifier, _asset, _l1Pool);
    }

    console.log('L2WithdrawalVerifier:', _verifier);
    console.log('L2PrivacyPool:', _pool);
    console.log('L2 chain id:', block.chainid);
  }

  function _saveDeploymentData(address _pool, address _verifier, address _asset, address _l1Pool) internal {
    string memory _json = string.concat(
      '{"chainId":',
      vm.toString(block.chainid),
      ',"contracts":[',
      '{"name":"L2WithdrawalVerifier","address":"',
      vm.toString(_verifier),
      '","deployer":"',
      vm.toString(vm.envAddress('DEPLOYER_ADDRESS')),
      '","deploymentBlock":',
      vm.toString(block.number),
      '},',
      '{"name":"L2PrivacyPool","address":"',
      vm.toString(_pool),
      '","deployer":"',
      vm.toString(vm.envAddress('DEPLOYER_ADDRESS')),
      '","deploymentBlock":',
      vm.toString(block.number),
      ',"scope":',
      vm.toString(L2PrivacyPool(payable(_pool)).SCOPE()),
      ',"asset":"',
      vm.toString(_asset),
      '","l1Pool":"',
      vm.toString(_l1Pool),
      '"}]} '
    );
    vm.writeJson(_json, string.concat('deployments/', vm.toString(block.chainid), '.json'));
    console.log('L2 deployment data saved to deployments/%s.json', vm.toString(block.chainid));
  }
}
