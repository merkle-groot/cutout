// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {IERC20} from '@oz/interfaces/IERC20.sol';

interface IBridgeAdapter {
  function bridge(
    address l2Pool,
    uint256 value,
    uint256 minGasMessage,
    uint256 minGastokens,
    bool isEthereum,
    address token,
    address remoteChainToken,
    uint256 commitment
  ) external payable;
}
