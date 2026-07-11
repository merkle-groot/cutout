// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {IBridgeAdapter} from "../interfaces/IBridgeAdapter.sol";
import {IERC20} from "@oz/interfaces/IERC20.sol";
import {Constants} from "../contracts/lib/Constants.sol";

contract BridgeMessenger {
  struct ChainConfig {
    bool isSupported;
    address adapter;
    mapping(address token => address l2Pool) l2Pool;
    mapping(address token => address l2Token) l2Token;
    uint256 minGasMessage;
    uint256 minGasTokens;
  }
  mapping(uint256 => ChainConfig) chainInfo;

  function _bridge(
    uint256 chainId,
    address token,
    uint256 value,
    uint256 commitment
  ) internal {
    ChainConfig storage chainConfig = chainInfo[chainId];
    require(chainConfig.isSupported, "chain id is not supported");

    address l2Pool = chainConfig.l2Pool[address(token)];
    bool isEthereum = false;
    address remoteChainToken = chainConfig.l2Token[l2Pool];
    if (token == Constants.NATIVE_ASSET) {
        isEthereum = true;
    }

    (bool success, bytes memory _data) = chainConfig.adapter.delegatecall(
      abi.encodeCall(
        IBridgeAdapter.bridge,
        (
          l2Pool,
          value,
          chainConfig.minGasMessage,
          chainConfig.minGasTokens,
          isEthereum,
          token,
          remoteChainToken,
          commitment
        )
      )
    );
    require(success, "bridging failed");
  }
}
