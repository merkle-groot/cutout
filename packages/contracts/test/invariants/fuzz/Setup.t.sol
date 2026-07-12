// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import {Entrypoint, IEntrypoint} from 'contracts/Entrypoint.sol';
import {IPrivacyPool, PrivacyPool} from 'contracts/PrivacyPool.sol';

import {ProofLib} from 'contracts/lib/ProofLib.sol';
import {InternalLeanIMT, LeanIMTData} from '@zk-kit/lean-imt.sol/InternalLeanIMT.sol';

import {Constants} from 'test/helper/Constants.sol';

import {IERC20} from '@oz/interfaces/IERC20.sol';
import {UnsafeUpgrades} from '@upgrades/Upgrades.sol';

import {HandlerActors} from './helpers/Actors.sol';

import {FuzzERC20} from './helpers/FuzzERC20.sol';
import {FuzzUtils, vm} from './helpers/FuzzUtils.sol';
import {GhostStorage} from './helpers/GhostStorage.sol';
import {MockVerifier} from './helpers/MockVerifier.sol';

contract Setup is HandlerActors, GhostStorage, FuzzUtils {
  MockVerifier mockVerifier;
  IERC20 token;
  Entrypoint entrypoint;
  IPrivacyPool nativePool;
  IPrivacyPool tokenPool;

  uint256 MIN_DEPOSIT = 1 ether;

  address OWNER = makeAddr('OWNER');
  address POSTMAN = makeAddr('POSTMAN');

  constructor() {
    mockVerifier = new MockVerifier();
    token = IERC20(address(new FuzzERC20()));

    address _impl = address(new Entrypoint());
    entrypoint = Entrypoint(
      payable(UnsafeUpgrades.deployUUPSProxy(_impl, abi.encodeCall(Entrypoint.initialize, (OWNER, POSTMAN))))
    );

    // Unified pool: native asset vs ERC20 is selected by the `_asset` arg
    // (`Constants.NATIVE_ASSET` for ETH), replacing the old Simple/Complex split.
    nativePool = IPrivacyPool(
      address(
        new PrivacyPool(
          address(entrypoint), address(mockVerifier), address(mockVerifier), Constants.NATIVE_ASSET
        )
      )
    );

    tokenPool = IPrivacyPool(
      address(new PrivacyPool(address(entrypoint), address(mockVerifier), address(mockVerifier), address(token)))
    );

    vm.prank(OWNER);
    entrypoint.registerPool(
      IERC20(Constants.NATIVE_ASSET), IPrivacyPool(nativePool), MIN_DEPOSIT, FEE_VETTING, MAX_RELAY_FEE
    );

    vm.prank(OWNER);
    entrypoint.registerPool(token, IPrivacyPool(tokenPool), MIN_DEPOSIT, FEE_VETTING, MAX_RELAY_FEE);

    vm.prank(POSTMAN);
    entrypoint.updateRoot(1, 'ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid');

    createNewActors(5);

    for (uint256 i = 0; i < actors.length; i++) {
      actors[i].call(address(token), 0, abi.encodeCall(IERC20.approve, (address(tokenPool), type(uint256).max)));
    }
  }
}
