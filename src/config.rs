use std::{env, fs, path::PathBuf};

use anyhow::Result;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    #[serde(default = "default_db_path")]
    pub db_path: PathBuf,
    #[serde(default = "default_blockchain_db_path")]
    pub blockchain_db_path: PathBuf,
    #[serde(default = "default_cert_path")]
    pub cert_path: PathBuf,
    #[serde(default = "default_key_path")]
    pub key_path: PathBuf,
    #[serde(default = "default_port")]
    pub port: u16,
    #[serde(default = "default_batch_size")]
    pub batch_size: u32,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            db_path: default_db_path(),
            blockchain_db_path: default_blockchain_db_path(),
            cert_path: default_cert_path(),
            key_path: default_key_path(),
            port: default_port(),
            batch_size: default_batch_size(),
        }
    }
}

impl Config {
    pub fn load() -> Result<Self> {
        let home_dir = homedir::my_home().unwrap().unwrap();
        let config_path = home_dir.join(".xchdev").join("config.toml");

        if let Ok(config) = fs::read_to_string(config_path) {
            Ok(toml::from_str(&config)?)
        } else {
            Ok(Config::default())
        }
    }
}

fn chia_root() -> PathBuf {
    let home_dir = homedir::my_home().unwrap().unwrap();
    env::var("CHIA_ROOT").map_or_else(|_| home_dir.join(".chia").join("mainnet"), PathBuf::from)
}

fn default_db_path() -> PathBuf {
    let home_dir = homedir::my_home().unwrap().unwrap();
    home_dir.join(".xchdev").join("db")
}

fn default_blockchain_db_path() -> PathBuf {
    chia_root().join("db").join("blockchain_v2_mainnet.sqlite")
}

fn default_cert_path() -> PathBuf {
    chia_root()
        .join("config")
        .join("ssl")
        .join("daemon")
        .join("private_daemon.crt")
}

fn default_key_path() -> PathBuf {
    chia_root()
        .join("config")
        .join("ssl")
        .join("daemon")
        .join("private_daemon.key")
}

fn default_port() -> u16 {
    3000
}

fn default_batch_size() -> u32 {
    1000
}
