use std::array::TryFromSliceError;

use chia::{clvm_traits::FromClvmError, consensus::validation_error::ValidationErr};
use clvmr::reduction::EvalErr;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum Error {
    #[error("Try from slice error: {0}")]
    TryFromSlice(#[from] TryFromSliceError),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Validation error: {0}")]
    Validation(#[from] ValidationErr),

    #[error("Eval error: {0}")]
    Eval(#[from] EvalErr),

    #[error("CLVM error: {0}")]
    FromClvm(#[from] FromClvmError),

    #[error("Missing reference block: {0}")]
    MissingReferenceBlock(u32),
}

pub type Result<T> = std::result::Result<T, Error>;
