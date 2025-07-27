use anyhow::Result;
use serde::{de::DeserializeOwned, Serialize};

pub fn encode(value: &impl Serialize) -> Result<Vec<u8>> {
    let mut bytes = Vec::new();
    ciborium::into_writer(value, &mut bytes)?;
    Ok(bytes)
}

pub fn decode<T: DeserializeOwned>(bytes: &[u8]) -> Result<T> {
    Ok(ciborium::from_reader(bytes)?)
}
