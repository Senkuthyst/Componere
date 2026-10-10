// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract MilestoneEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;
    enum State { Created, Funded, Released, Refunded }
    struct Milestone { uint256 amount; bool approved; bool released; }
    address public immutable client;
    address public immutable provider;
    IERC20 public immutable token;
    uint256 public immutable expiresAt;
    State public state;
    uint256 public releasedAmount;
    Milestone[] public milestones;
    event Funded(uint256 amount);
    event MilestoneApproved(uint256 indexed index, address indexed approver);
    event MilestoneReleased(uint256 indexed index, uint256 amount);
    event Refunded(uint256 amount);

    constructor(address client_, address provider_, address token_, uint256 expiresAt_, uint256[] memory amounts) {
        require(client_ != address(0) && provider_ != address(0) && token_ != address(0), "zero address");
        require(amounts.length > 0 && expiresAt_ > block.timestamp, "invalid terms");
        client = client_; provider = provider_; token = IERC20(token_); expiresAt = expiresAt_; state = State.Created;
        uint256 total; for (uint256 i; i < amounts.length; ++i) { require(amounts[i] > 0, "zero milestone"); milestones.push(Milestone(amounts[i], false, false)); total += amounts[i]; }
        require(total > 0, "zero total");
    }
    function fund() external nonReentrant { require(msg.sender == client && state == State.Created, "not client or created"); uint256 total; for (uint256 i; i < milestones.length; ++i) total += milestones[i].amount; token.safeTransferFrom(client, address(this), total); state = State.Funded; emit Funded(total); }
    function approveMilestone(uint256 index) external { require(msg.sender == client && state == State.Funded, "not client or funded"); require(index < milestones.length && !milestones[index].approved, "invalid milestone"); milestones[index].approved = true; emit MilestoneApproved(index, msg.sender); }
    function releaseMilestone(uint256 index) external nonReentrant { require(msg.sender == client && state == State.Funded, "not client or funded"); require(index < milestones.length, "invalid milestone"); Milestone storage milestone = milestones[index]; require(milestone.approved && !milestone.released, "not approved or released"); milestone.released = true; releasedAmount += milestone.amount; token.safeTransfer(provider, milestone.amount); if (releasedAmount == totalAmount()) state = State.Released; emit MilestoneReleased(index, milestone.amount); }
    function refund() external nonReentrant { require(msg.sender == client && state == State.Funded && block.timestamp >= expiresAt, "refund unavailable"); uint256 balance = token.balanceOf(address(this)); state = State.Refunded; token.safeTransfer(client, balance); emit Refunded(balance); }
    function totalAmount() public view returns (uint256 total) { for (uint256 i; i < milestones.length; ++i) total += milestones[i].amount; }
}