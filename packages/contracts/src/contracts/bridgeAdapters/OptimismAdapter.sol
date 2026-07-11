// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { IL2Pool } from "../../interfaces/IL2Pool.sol";
import {IL1CrossDomainMessenger} from "../../interfaces/external/IOptimismAdapter.sol";
import {IL1StandardBridge} from "../../interfaces/external/IOptimismAdapter.sol";
import {SafeERC20} from '@oz/token/ERC20/utils/SafeERC20.sol';
import {IERC20} from '@oz/interfaces/IERC20.sol';
import {IBridgeAdapter} from "../../interfaces/IBridgeAdapter.sol";
import {AccessControlUpgradeable} from '@oz-upgradeable/access/AccessControlUpgradeable.sol';
import {UUPSUpgradeable} from '@oz-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import {ReentrancyGuardUpgradeable} from '@oz-upgradeable/utils/ReentrancyGuardUpgradeable.sol';


contract OptimismAdapter is IBridgeAdapter, AccessControlUpgradeable, UUPSUpgradeable {
  using SafeERC20 for IERC20;
  address L1CrossDomainMessenger;
  address L1StandardBridge;

  /// @dev 0xb19546dff01e856fb3f010c267a7b1c60363cf8a4664e21cc89c26224620214e
  bytes32 internal constant _OWNER_ROLE = keccak256('OWNER_ROLE');

  /// @dev 0xfc84ade01695dae2ade01aa4226dc40bdceaf9d5dbd3bf8630b1dd5af195bbc5
  bytes32 internal constant _ADMIN_ROLE = keccak256('ADMIN_ROLE');

  event L1CrossDomainMessengerUpdated(address indexed prevL1CrossDomainMessenger, address indexed newL1CrossDomainMessenger);
  event L1StandardBridgeUpdated(address indexed prevL1StandardBridge, address indexed newL1StandardBridge);

  /**
   * @notice Thrown when an address parameter is zero
   */
  error ZeroAddress();
  /*///////////////////////////////////////////////////////////////
                          INITIALIZATION
  //////////////////////////////////////////////////////////////*/

  /**
   * @notice Disables initializers. Using UUPS upgradeability pattern
   */
  constructor() {
    _disableInitializers();
  }

  function initialize(address _owner, address _admin, address _L1CrossDomainMessenger, address _L1StandardBridge) external initializer {
    // Initialize upgradeable contracts
    __UUPSUpgradeable_init();
    __AccessControl_init();

    // Initialize roles
    _setRoleAdmin(DEFAULT_ADMIN_ROLE, _OWNER_ROLE);
    _setRoleAdmin(_OWNER_ROLE, _OWNER_ROLE); // Owner can manage owner role
    _setRoleAdmin(_ADMIN_ROLE, _OWNER_ROLE); // Owner can manage postman role

    _grantRole(_OWNER_ROLE, _owner);
    _grantRole(_ADMIN_ROLE, _admin);
  }

  function updateL1CrossDomainMessenger(address _L1CrossDomainMessenger) external onlyRole(_ADMIN_ROLE) {
    if(_L1CrossDomainMessenger == address(0)) revert ZeroAddress();

    emit L1CrossDomainMessengerUpdated(L1CrossDomainMessenger, _L1CrossDomainMessenger);
    L1CrossDomainMessenger = _L1CrossDomainMessenger;
  }

  function updateL1StandardBridge(address _L1StandardBridge) external onlyRole(_ADMIN_ROLE) {
    if(_L1StandardBridge == address(0)) revert ZeroAddress();

    emit L1CrossDomainMessengerUpdated(L1CrossDomainMessenger, _L1StandardBridge);
    L1StandardBridge = _L1StandardBridge;
  }

  function bridge(
		address l2Pool,
		uint256 value,
		uint256 minGasMessage,
		uint256 minGasTokens,
		bool isEthereum,
		address token,
		address remoteChainToken,
		uint256 commitment
  ) external payable {
    bytes memory message = abi.encode(
      IL2Pool.deposit.selector,
      value,
      commitment
    );

    IL1CrossDomainMessenger(L1CrossDomainMessenger).sendMessage(
      l2Pool,
      message,
      uint32(minGasMessage)
    );

    bytes memory extraData = bytes("");
    if (isEthereum) {
      IL1StandardBridge(L1StandardBridge).bridgeETHTo(
        l2Pool,
        uint32(minGasTokens),
        extraData
      );
    } else {
      // assume max tokens are approved to the bridge
      IL1StandardBridge(L1StandardBridge).bridgeERC20To(
        token,
        remoteChainToken,
        l2Pool,
        value,
        uint32(minGasTokens),
        extraData
      );
    }
  }
}
