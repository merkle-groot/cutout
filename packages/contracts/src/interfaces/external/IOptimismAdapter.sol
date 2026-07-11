// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;
interface IL1CrossDomainMessenger {
  function sendMessage(address _target, bytes calldata _message, uint32 _minGasLimit) external payable;
}

interface IL1StandardBridge {
	function bridgeERC20To(
		address _localToken,
		address _remoteToken,
		address _to,
		uint256 _amount,
		uint32 _minGasLimit,
		bytes calldata _extraData
	) external;

	function bridgeETHTo(address _to, uint32 _minGasLimit, bytes calldata _extraData) external payable;
}