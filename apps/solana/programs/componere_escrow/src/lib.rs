use anchor_lang::prelude::*;

declare_id!("4M9sJ5NQpWw5e3FqG8xJ4J6z8X2V5Y7K1H3D9R2T6L8");

const MAX_MILESTONES: usize = 16;

#[program]
pub mod componere_escrow {
    use super::*;

    pub fn initialize_escrow(
        ctx: Context<InitializeEscrow>,
        agreement_id: [u8; 32],
        milestones: Vec<MilestoneInput>,
        expires_at: i64,
    ) -> Result<()> {
        require!(!milestones.is_empty() && milestones.len() <= MAX_MILESTONES, EscrowError::InvalidMilestones);
        require!(milestones.iter().all(|milestone| milestone.amount > 0), EscrowError::InvalidMilestoneAmount);
        require!(expires_at > Clock::get()?.unix_timestamp, EscrowError::InvalidExpiry);

        let total_amount = milestones.iter().try_fold(0u64, |total, milestone| {
            total.checked_add(milestone.amount).ok_or(error!(EscrowError::AmountOverflow))
        })?;
        let escrow = &mut ctx.accounts.escrow;
        escrow.bump = ctx.bumps.escrow;
        escrow.client = ctx.accounts.client.key();
        escrow.contractor = ctx.accounts.contractor.key();
        escrow.agreement_id = agreement_id;
        escrow.total_amount = total_amount;
        escrow.funded_amount = 0;
        escrow.released_amount = 0;
        escrow.expires_at = expires_at;
        escrow.status = EscrowStatus::Created;
        escrow.milestones = milestones
            .into_iter()
            .map(|milestone| Milestone {
                id: milestone.id,
                amount: milestone.amount,
                approved: false,
                released: false,
            })
            .collect();
        Ok(())
    }

    pub fn fund_escrow(ctx: Context<FundEscrow>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.status == EscrowStatus::Created, EscrowError::InvalidState);
        require!(escrow.client == ctx.accounts.client.key(), EscrowError::Unauthorized);

        let transfer = anchor_lang::system_program::Transfer {
            from: ctx.accounts.client.to_account_info(),
            to: escrow.to_account_info(),
        };
        anchor_lang::system_program::transfer(
            CpiContext::new(ctx.accounts.system_program.to_account_info(), transfer),
            escrow.total_amount,
        )?;
        escrow.funded_amount = escrow.total_amount;
        escrow.status = EscrowStatus::Funded;
        Ok(())
    }

    pub fn approve_milestone(ctx: Context<ApproveMilestone>, milestone_id: [u8; 16]) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.status == EscrowStatus::Funded, EscrowError::InvalidState);
        require!(escrow.client == ctx.accounts.client.key(), EscrowError::Unauthorized);
        let milestone = escrow.milestones.iter_mut().find(|item| item.id == milestone_id).ok_or(error!(EscrowError::MilestoneNotFound))?;
        require!(!milestone.approved && !milestone.released, EscrowError::MilestoneAlreadyProcessed);
        milestone.approved = true;
        Ok(())
    }

    pub fn release_milestone(ctx: Context<ReleaseMilestone>, milestone_id: [u8; 16]) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.status == EscrowStatus::Funded, EscrowError::InvalidState);
        require!(escrow.client == ctx.accounts.client.key(), EscrowError::Unauthorized);
        require!(escrow.contractor == ctx.accounts.contractor.key(), EscrowError::InvalidContractor);
        let milestone = escrow.milestones.iter_mut().find(|item| item.id == milestone_id).ok_or(error!(EscrowError::MilestoneNotFound))?;
        require!(milestone.approved && !milestone.released, EscrowError::MilestoneNotApproved);
        let amount = milestone.amount;
        let released_amount = escrow.released_amount.checked_add(amount).ok_or(error!(EscrowError::AmountOverflow))?;
        require!(released_amount <= escrow.funded_amount, EscrowError::InsufficientFunds);

        **escrow.to_account_info().try_borrow_mut_lamports()? = escrow.to_account_info().lamports().checked_sub(amount).ok_or(error!(EscrowError::InsufficientFunds))?;
        **ctx.accounts.contractor.to_account_info().try_borrow_mut_lamports()? = ctx.accounts.contractor.to_account_info().lamports().checked_add(amount).ok_or(error!(EscrowError::AmountOverflow))?;
        milestone.released = true;
        escrow.released_amount = released_amount;
        if released_amount == escrow.total_amount {
            escrow.status = EscrowStatus::Released;
        }
        Ok(())
    }

    pub fn cancel_or_refund(ctx: Context<CancelOrRefund>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.status == EscrowStatus::Funded, EscrowError::InvalidState);
        require!(escrow.client == ctx.accounts.client.key(), EscrowError::Unauthorized);
        require!(Clock::get()?.unix_timestamp >= escrow.expires_at, EscrowError::NotExpired);
        let refund_amount = escrow.funded_amount.checked_sub(escrow.released_amount).ok_or(error!(EscrowError::AmountOverflow))?;
        **escrow.to_account_info().try_borrow_mut_lamports()? = escrow.to_account_info().lamports().checked_sub(refund_amount).ok_or(error!(EscrowError::InsufficientFunds))?;
        **ctx.accounts.client.to_account_info().try_borrow_mut_lamports()? = ctx.accounts.client.to_account_info().lamports().checked_add(refund_amount).ok_or(error!(EscrowError::AmountOverflow))?;
        escrow.status = EscrowStatus::Refunded;
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MilestoneInput {
    pub id: [u8; 16],
    pub amount: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub struct Milestone {
    pub id: [u8; 16],
    pub amount: u64,
    pub approved: bool,
    pub released: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum EscrowStatus {
    Created,
    Funded,
    Released,
    Refunded,
}

#[account]
pub struct Escrow {
    pub bump: u8,
    pub client: Pubkey,
    pub contractor: Pubkey,
    pub agreement_id: [u8; 32],
    pub total_amount: u64,
    pub funded_amount: u64,
    pub released_amount: u64,
    pub expires_at: i64,
    pub status: EscrowStatus,
    pub milestones: Vec<Milestone>,
}

#[derive(Accounts)]
#[instruction(agreement_id: [u8; 32])]
pub struct InitializeEscrow<'info> {
    #[account(init, payer = client, space = 8 + 1 + 32 + 32 + 32 + 8 + 8 + 8 + 8 + 1 + 4 + (16 + 8 + 1 + 1) * MAX_MILESTONES, seeds = [b"escrow", client.key().as_ref(), &agreement_id], bump)]
    pub escrow: Account<'info, Escrow>,
    #[account(mut)]
    pub client: Signer<'info>,
    /// CHECK: The contractor is stored as a recipient and constrained on release.
    pub contractor: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FundEscrow<'info> {
    #[account(mut, has_one = client)]
    pub escrow: Account<'info, Escrow>,
    #[account(mut)]
    pub client: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ApproveMilestone<'info> {
    #[account(mut, has_one = client)]
    pub escrow: Account<'info, Escrow>,
    pub client: Signer<'info>,
}

#[derive(Accounts)]
pub struct ReleaseMilestone<'info> {
    #[account(mut, has_one = client, has_one = contractor)]
    pub escrow: Account<'info, Escrow>,
    pub client: Signer<'info>,
    /// CHECK: Address is constrained by escrow.contractor.
    #[account(mut)]
    pub contractor: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct CancelOrRefund<'info> {
    #[account(mut, has_one = client)]
    pub escrow: Account<'info, Escrow>,
    #[account(mut)]
    pub client: Signer<'info>,
}

#[error_code]
pub enum EscrowError {
    #[msg("The signer is not authorized for this escrow action")]
    Unauthorized,
    #[msg("The escrow is not in a valid state for this action")]
    InvalidState,
    #[msg("Milestones must contain between one and sixteen entries")]
    InvalidMilestones,
    #[msg("Milestone amounts must be positive")]
    InvalidMilestoneAmount,
    #[msg("Milestone could not be found")]
    MilestoneNotFound,
    #[msg("Milestone was already approved or released")]
    MilestoneAlreadyProcessed,
    #[msg("Milestone must be approved before release")]
    MilestoneNotApproved,
    #[msg("The contractor account does not match the escrow")]
    InvalidContractor,
    #[msg("The escrow has insufficient funds")]
    InsufficientFunds,
    #[msg("The escrow has not expired")]
    NotExpired,
    #[msg("The expiry must be in the future")]
    InvalidExpiry,
    #[msg("The amount exceeds the supported integer range")]
    AmountOverflow,
}
