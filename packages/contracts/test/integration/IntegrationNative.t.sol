// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {IntegrationBase} from './IntegrationBase.sol';
import {InternalLeanIMT, LeanIMTData} from '@zk-kit/lean-imt.sol/InternalLeanIMT.sol';

import {ProofLib} from 'contracts/lib/ProofLib.sol';
import {IEntrypoint} from 'interfaces/IEntrypoint.sol';
import {IPrivacyPool} from 'interfaces/IPrivacyPool.sol';
import {IState} from 'interfaces/IState.sol';

contract RagequitMockMessenger {
  function sendMessage(address, bytes calldata, uint32) external payable {}
}

contract RagequitMockStandardBridge {
  function bridgeETHTo(address _to, uint32, bytes calldata) external payable {
    (bool _success,) = payable(_to).call{value: msg.value}('');
    require(_success, 'Bridge delivery failed');
  }
}

contract IntegrationNative is IntegrationBase {
  using InternalLeanIMT for LeanIMTData;

  Commitment internal _commitment;

  /**
   * @notice Test that users can make a deposit and fully withdraw its value (after fees) directly, without a relayer
   */
  function test_fullDirectWithdrawal() public {
    // Alice deposits 100 ETH
    _commitment = _deposit(
      DepositParams({depositor: _ALICE, asset: _ETH, amount: 100 ether, nullifier: 'nullifier_1', secret: 'secret_1'})
    );

    // Push ASP root with label included
    vm.prank(_POSTMAN);
    _entrypoint.updateRoot(_shadowASPMerkleTree._root(), 'ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid');

    // Bob withdraws the total amount of Alice's commitment
    _selfWithdraw(
      WithdrawalParams({
        withdrawnAmount: _commitment.value,
        newNullifier: 'nullifier_2',
        newSecret: 'secret_2',
        recipient: _BOB,
        commitment: _commitment,
        revertReason: NONE
      })
    );
  }

  /**
   * @notice Test that users can make a deposit and fully withdraw its value (after fees) through a relayer
   */
  function test_fullRelayedWithdrawal() public {
    // Alice deposits 100 ETH
    _commitment = _deposit(
      DepositParams({depositor: _ALICE, asset: _ETH, amount: 100 ether, nullifier: 'nullifier_1', secret: 'secret_1'})
    );

    // Push ASP root with label included
    vm.prank(_POSTMAN);
    _entrypoint.updateRoot(_shadowASPMerkleTree._root(), 'ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid');

    // Bob receives withdraws total amount of Alice's commitment through a relayer
    _withdrawThroughRelayer(
      WithdrawalParams({
        withdrawnAmount: _commitment.value,
        newNullifier: 'nullifier_2',
        newSecret: 'secret_2',
        recipient: _BOB,
        commitment: _commitment,
        revertReason: NONE
      })
    );
  }

  /**
   * @notice Test that users can make a deposit and partially withdraw, without a relayer
   */
  function test_partialDirectWithdrawal() public {
    // Alice deposits 100 ETH
    _commitment = _deposit(
      DepositParams({depositor: _ALICE, asset: _ETH, amount: 100 ether, nullifier: 'nullifier_1', secret: 'secret_1'})
    );

    // Push ASP root with label included
    vm.prank(_POSTMAN);
    _entrypoint.updateRoot(_shadowASPMerkleTree._root(), 'ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid');

    // Bob withdraws the total amount of Alice's commitment
    _selfWithdraw(
      WithdrawalParams({
        withdrawnAmount: 20 ether,
        newNullifier: 'nullifier_2',
        newSecret: 'secret_2',
        recipient: _BOB,
        commitment: _commitment,
        revertReason: NONE
      })
    );
  }

  /**
   * @notice Test that users can make a deposit and do multiple partial withdrawals without a relayer
   */
  function test_multiplePartialDirectWithdrawals() public {
    // Alice deposits 100 ETH
    _commitment = _deposit(
      DepositParams({depositor: _ALICE, asset: _ETH, amount: 100 ether, nullifier: 'nullifier_1', secret: 'secret_1'})
    );

    // Push ASP root with label included
    vm.prank(_POSTMAN);
    _entrypoint.updateRoot(_shadowASPMerkleTree._root(), 'ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid');

    // Withdraw 20 ETH to Bob
    _commitment = _selfWithdraw(
      WithdrawalParams({
        withdrawnAmount: 20 ether,
        newNullifier: 'nullifier_2',
        newSecret: 'secret_2',
        recipient: _BOB,
        commitment: _commitment,
        revertReason: NONE
      })
    );

    // Withdraw 20 ETH to Bob
    _commitment = _selfWithdraw(
      WithdrawalParams({
        withdrawnAmount: 20 ether,
        newNullifier: 'nullifier_3',
        newSecret: 'secret_3',
        recipient: _BOB,
        commitment: _commitment,
        revertReason: NONE
      })
    );

    // Withdraw 20 ETH to Bob
    _commitment = _selfWithdraw(
      WithdrawalParams({
        withdrawnAmount: 20 ether,
        newNullifier: 'nullifier_4',
        newSecret: 'secret_4',
        recipient: _BOB,
        commitment: _commitment,
        revertReason: NONE
      })
    );

    // Withdraw 20 ETH to Bob
    _commitment = _selfWithdraw(
      WithdrawalParams({
        withdrawnAmount: 20 ether,
        newNullifier: 'nullifier_5',
        newSecret: 'secret_5',
        recipient: _BOB,
        commitment: _commitment,
        revertReason: NONE
      })
    );

    // Withdraw remaining balance to Bob
    _commitment = _selfWithdraw(
      WithdrawalParams({
        withdrawnAmount: _commitment.value,
        newNullifier: 'nullifier_6',
        newSecret: 'secret_6',
        recipient: _BOB,
        commitment: _commitment,
        revertReason: NONE
      })
    );
  }

  /**
   * @notice Test that users can make a deposit and do a partial withdrawal through a relayer
   */
  function test_partialRelayedWithdrawal() public {
    // Alice deposits 100 ETH
    _commitment = _deposit(
      DepositParams({depositor: _ALICE, asset: _ETH, amount: 100 ether, nullifier: 'nullifier_1', secret: 'secret_1'})
    );

    // Push ASP root with label included
    vm.prank(_POSTMAN);
    _entrypoint.updateRoot(_shadowASPMerkleTree._root(), 'ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid');

    // Bob receives the total amount of Alice's commitment through a relayer
    _withdrawThroughRelayer(
      WithdrawalParams({
        withdrawnAmount: 40 ether,
        newNullifier: 'nullifier_2',
        newSecret: 'secret_2',
        recipient: _BOB,
        commitment: _commitment,
        revertReason: NONE
      })
    );
  }

  /**
   * @notice Test that users can make a deposit and do multiple partial withdrawals through a relayer
   */
  function test_multiplePartialRelayedWithdrawals() public {
    // Alice deposits 100 ETH
    _commitment = _deposit(
      DepositParams({depositor: _ALICE, asset: _ETH, amount: 100 ether, nullifier: 'nullifier_1', secret: 'secret_1'})
    );

    // Push ASP root with label included
    vm.prank(_POSTMAN);
    _entrypoint.updateRoot(_shadowASPMerkleTree._root(), 'ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid');

    // Withdraw 20 ETH to Bob
    _commitment = _withdrawThroughRelayer(
      WithdrawalParams({
        withdrawnAmount: 20 ether,
        newNullifier: 'nullifier_2',
        newSecret: 'secret_2',
        recipient: _BOB,
        commitment: _commitment,
        revertReason: NONE
      })
    );

    // Withdraw 20 ETH to Bob
    _commitment = _withdrawThroughRelayer(
      WithdrawalParams({
        withdrawnAmount: 20 ether,
        newNullifier: 'nullifier_3',
        newSecret: 'secret_3',
        recipient: _BOB,
        commitment: _commitment,
        revertReason: NONE
      })
    );

    // Withdraw 20 ETH to Bob
    _commitment = _withdrawThroughRelayer(
      WithdrawalParams({
        withdrawnAmount: 20 ether,
        newNullifier: 'nullifier_4',
        newSecret: 'secret_4',
        recipient: _BOB,
        commitment: _commitment,
        revertReason: NONE
      })
    );

    // Withdraw 20 ETH to Bob
    _commitment = _withdrawThroughRelayer(
      WithdrawalParams({
        withdrawnAmount: 20 ether,
        newNullifier: 'nullifier_5',
        newSecret: 'secret_5',
        recipient: _BOB,
        commitment: _commitment,
        revertReason: NONE
      })
    );

    // Withdraw remaining balance to Bob
    _commitment = _withdrawThroughRelayer(
      WithdrawalParams({
        withdrawnAmount: _commitment.value,
        newNullifier: 'nullifier_6',
        newSecret: 'secret_6',
        recipient: _BOB,
        commitment: _commitment,
        revertReason: NONE
      })
    );
  }

  /**
   * @notice Test that users can ragequit a commitment when their label is not in the ASP tree
   */
  function test_ragequit() public {
    // Alice deposits 100 ETH
    _commitment = _deposit(
      DepositParams({depositor: _ALICE, asset: _ETH, amount: 100 ether, nullifier: 'nullifier_1', secret: 'secret_1'})
    );

    // Push ASP root without label
    vm.prank(_POSTMAN);
    _entrypoint.updateRoot(
      uint256(keccak256('some_root')) % SNARK_SCALAR_FIELD, 'ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid'
    );

    // Fail to withdraw because the label is not included in the latest ASP root
    _withdrawThroughRelayer(
      WithdrawalParams({
        withdrawnAmount: 40 ether,
        newNullifier: 'nullifier_2',
        newSecret: 'secret_2',
        recipient: _BOB,
        commitment: _commitment,
        revertReason: IPrivacyPool.IncorrectASPRoot.selector
      })
    );

    // Ragequit full amount
    _ragequit(_ALICE, _commitment);
  }

  /**
   * @notice Ragequit remains available after wind-down because it is the pool's emergency exit
   */
  function test_ragequitAfterWindDown() public {
    _commitment = _deposit(
      DepositParams({depositor: _ALICE, asset: _ETH, amount: 100 ether, nullifier: 'nullifier_1', secret: 'secret_1'})
    );

    vm.prank(_OWNER);
    _entrypoint.windDownPool(IPrivacyPool(address(_ethPool)));
    assertTrue(_ethPool.dead(), 'Pool should be dead');

    _ragequit(_ALICE, _commitment);
    assertTrue(_ethPool.dead(), 'Pool should remain dead');
  }

  /**
   * @notice Test that users can get approved by the ASP, make a partial withdrawal, and if removed from the ASP set, they can only ragequit
   */
  function test_aspRemoval() public {
    // Alice deposits 100 ETH
    _commitment = _deposit(
      DepositParams({depositor: _ALICE, asset: _ETH, amount: 100 ether, nullifier: 'nullifier_1', secret: 'secret_1'})
    );

    // Push ASP root with label included
    vm.prank(_POSTMAN);
    _entrypoint.updateRoot(_shadowASPMerkleTree._root(), 'ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid');

    // Withdraw 40 ETH through relayer
    _commitment = _withdrawThroughRelayer(
      WithdrawalParams({
        withdrawnAmount: 40 ether,
        newNullifier: 'nullifier_2',
        newSecret: 'secret_2',
        recipient: _BOB,
        commitment: _commitment,
        revertReason: NONE
      })
    );

    // Remove label from ASP
    vm.prank(_POSTMAN);
    _entrypoint.updateRoot(
      uint256(keccak256('some_root')) % SNARK_SCALAR_FIELD, 'ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid'
    );

    // Fail to withdraw because label is not included in the latest ASP root
    _withdrawThroughRelayer(
      WithdrawalParams({
        withdrawnAmount: 40 ether,
        newNullifier: 'nullifier_3',
        newSecret: 'secret_3',
        recipient: _BOB,
        commitment: _commitment,
        revertReason: IPrivacyPool.IncorrectASPRoot.selector
      })
    );

    // Ragequit
    _ragequit(_ALICE, _commitment);
  }

  /**
   * @notice A partial withdrawal's L1 change note keeps the deposit label and can be ragequit by the original depositor
   */
  function test_ragequitChangeNoteAfterPartialWithdrawal() public {
    Commitment memory _parent = _deposit(
      DepositParams({depositor: _ALICE, asset: _ETH, amount: 100 ether, nullifier: 'nullifier_1', secret: 'secret_1'})
    );

    RagequitMockMessenger _messenger = new RagequitMockMessenger();
    RagequitMockStandardBridge _bridge = new RagequitMockStandardBridge();
    IEntrypoint.BridgeConfig memory _bridgeConfig = IEntrypoint.BridgeConfig({
      kind: IEntrypoint.BridgeKind.OpStack,
      isSupported: true,
      l1Messenger: address(_messenger),
      l1TokenBridge: address(_bridge),
      l2Pool: _BOB,
      l2PoolFelt: 0,
      l2Handler: 0,
      l2Token: _BOB,
      messageGasLimit: 100_000,
      messageMaxFeePerGas: 0,
      messageFee: 0,
      tokenGasLimit: 100_000,
      tokenMaxFeePerGas: 0,
      tokenFee: 0
    });
    vm.prank(_OWNER);
    _entrypoint.setBridgeConfig(0, address(_ETH), _bridgeConfig);

    vm.prank(_POSTMAN);
    _entrypoint.updateRoot(_shadowASPMerkleTree._root(), 'ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid');

    Commitment memory _change = _withdrawThroughRelayer(
      WithdrawalParams({
        withdrawnAmount: 40 ether,
        newNullifier: 'nullifier_2',
        newSecret: 'secret_2',
        recipient: _BOB,
        commitment: _parent,
        revertReason: NONE
      })
    );

    uint256 _parentNullifierHash = _hashNullifier(_parent.nullifier);
    uint256 _changeNullifierHash = _hashNullifier(_change.nullifier);
    assertTrue(_ethPool.nullifierHashes(_parentNullifierHash), 'Parent nullifier must remain spent');
    assertFalse(_ethPool.nullifierHashes(_changeNullifierHash), 'Change nullifier must start unspent');
    assertEq(_change.value, _parent.value - 40 ether, 'Incorrect change-note value');

    // The spent parent remains in the state tree, but its burned nullifier prevents a second exit.
    ProofLib.RagequitProof memory _parentProof =
      _generateRagequitProof(_parent.value, _parent.label, _parent.nullifier, _parent.secret);
    vm.prank(_ALICE);
    vm.expectRevert(IState.NullifierAlreadySpent.selector);
    _ethPool.ragequit(_parentProof);

    _ragequit(_ALICE, _change);

    assertTrue(_ethPool.nullifierHashes(_parentNullifierHash), 'Parent nullifier must stay spent');
    assertTrue(_ethPool.nullifierHashes(_changeNullifierHash), 'Change nullifier must be spent after ragequit');
  }

  /**
   * @notice Test that users can't spend a commitment more than once
   */
  function test_failWhenCommitmentAlreadySpent() public {
    // Alice deposits 100 ETH
    _commitment = _deposit(
      DepositParams({depositor: _ALICE, asset: _ETH, amount: 100 ether, nullifier: 'nullifier_1', secret: 'secret_1'})
    );

    // Push ASP root with label included
    vm.prank(_POSTMAN);
    _entrypoint.updateRoot(_shadowASPMerkleTree._root(), 'ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid');

    // Fully spend commitment
    _selfWithdraw(
      WithdrawalParams({
        withdrawnAmount: _commitment.value,
        newNullifier: 'nullifier_2',
        newSecret: 'secret_2',
        recipient: _BOB,
        commitment: _commitment,
        revertReason: NONE
      })
    );

    // Fail to spend same commitment that was just spent
    _selfWithdraw(
      WithdrawalParams({
        withdrawnAmount: _commitment.value,
        newNullifier: 'nullifier_3',
        newSecret: 'secret_3',
        recipient: _BOB,
        commitment: _commitment,
        revertReason: IState.NullifierAlreadySpent.selector
      })
    );
  }

  /**
   * @notice Test that spent commitments can not be ragequitted (and spent again)
   */
  function test_failWhenTryingToSpendRagequitCommitment() public {
    // Alice deposits 100 ETH
    _commitment = _deposit(
      DepositParams({depositor: _ALICE, asset: _ETH, amount: 100 ether, nullifier: 'nullifier_1', secret: 'secret_1'})
    );

    // Ragequit full amount
    _ragequit(_ALICE, _commitment);

    // Push ASP root with label included
    vm.prank(_POSTMAN);
    _entrypoint.updateRoot(_shadowASPMerkleTree._root(), 'ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid_ipfs_cid');

    // Fail to withdraw commitment that was already ragequitted
    _selfWithdraw(
      WithdrawalParams({
        withdrawnAmount: _commitment.value,
        newNullifier: 'nullifier_2',
        newSecret: 'secret_2',
        recipient: _BOB,
        commitment: _commitment,
        revertReason: IState.NullifierAlreadySpent.selector
      })
    );
  }
}
