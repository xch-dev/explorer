import { bytesEqual, Constants, Puzzle, toHex } from 'chia-wallet-sdk-wasm';
import { toAddress } from '../conversions';
import { ArgType } from './arg';

export interface ParsedLayer {
  name: string;
  modHash: string;
  args: Record<string, LayerArg>;
  children: Record<string, ParsedLayer>;
}

export interface LayerArg {
  value: string | undefined;
  type: ArgType;
}

export function parseLayer(puzzle: Puzzle): ParsedLayer {
  let name = 'Unknown';

  const args: Record<string, LayerArg> = {};
  const children: Record<string, ParsedLayer> = {};

  args.mod_hash = {
    value: `0x${toHex(puzzle.modHash)}`,
    type: ArgType.Copiable,
  };

  const uncurried = puzzle.program.uncurry()?.args;
  const arg = (index: number) => uncurried?.[index];

  if (
    bytesEqual(puzzle.modHash, Constants.p2DelegatedPuzzleOrHiddenPuzzleHash())
  ) {
    name = 'P2_DELEGATED_PUZZLE_OR_HIDDEN_PUZZLE';

    const syntheticKey = arg(0)?.toAtom();

    args.synthetic_public_key = {
      value: syntheticKey ? `0x${toHex(syntheticKey)}` : 'Missing',
      type: ArgType.Copiable,
    };
  } else if (bytesEqual(puzzle.modHash, Constants.p2DelegatedPuzzleHash())) {
    name = 'P2_DELEGATED_PUZZLE';

    const publicKey = arg(0)?.toAtom();

    args.public_key = {
      value: publicKey && `0x${toHex(publicKey)}`,
      type: ArgType.Copiable,
    };
  } else if (bytesEqual(puzzle.modHash, Constants.catPuzzleHash())) {
    name = 'CAT_V2';

    const assetId = arg(1)?.toAtom();
    const innerPuzzle = arg(2);

    args.asset_id = {
      value: assetId && `0x${toHex(assetId)}`,
      type: ArgType.Copiable,
    };

    if (innerPuzzle) children.inner_puzzle = parseLayer(innerPuzzle.puzzle());
  } else if (bytesEqual(puzzle.puzzleHash, Constants.settlementPaymentHash())) {
    name = 'SETTLEMENT_PAYMENT';
  } else if (bytesEqual(puzzle.puzzleHash, Constants.singletonLauncherHash())) {
    name = 'SINGLETON_LAUNCHER';
  } else if (bytesEqual(puzzle.modHash, Constants.singletonTopLayerV11Hash())) {
    name = 'SINGLETON_TOP_LAYER_V1_1';

    const singletonStruct = arg(0);
    const pair = singletonStruct?.toPair()?.rest.toPair();
    const launcherId = pair?.first.toAtom();
    const launcherPuzzleHash = pair?.rest.toAtom();

    const innerPuzzle = arg(1);

    args.launcher_id = {
      value: launcherId && `0x${toHex(launcherId)}`,
      type: ArgType.CoinId,
    };

    args.launcher_puzzle_hash = {
      value: launcherPuzzleHash && `0x${toHex(launcherPuzzleHash)}`,
      type: ArgType.Copiable,
    };

    if (innerPuzzle) children.inner_puzzle = parseLayer(innerPuzzle.puzzle());
  } else if (bytesEqual(puzzle.modHash, Constants.nftStateLayerHash())) {
    name = 'NFT_STATE_LAYER';

    const metadataProgram = arg(1);
    const metadataUpdaterPuzzleHash = arg(2)?.toAtom();
    const innerPuzzle = arg(3);

    const metadata = metadataProgram?.parseNftMetadata();

    if (metadataProgram && !metadata) {
      args.metadata = {
        value: metadataProgram.unparse(),
        type: ArgType.NonCopiable,
      };
    }

    if (metadata) {
      if (metadata.dataHash) {
        args.data_hash = {
          value: `0x${toHex(metadata.dataHash)}`,
          type: ArgType.Copiable,
        };
      }

      if (metadata.dataUris.length) {
        args.data_uris = {
          value: metadata.dataUris.join(', '),
          type: ArgType.NonCopiable,
        };
      }

      if (metadata.metadataHash) {
        args.metadata_hash = {
          value: `0x${toHex(metadata.metadataHash)}`,
          type: ArgType.Copiable,
        };
      }

      if (metadata.metadataUris.length) {
        args.metadata_uris = {
          value: metadata.metadataUris.join(', '),
          type: ArgType.NonCopiable,
        };
      }

      if (metadata.licenseHash) {
        args.license_hash = {
          value: `0x${toHex(metadata.licenseHash)}`,
          type: ArgType.Copiable,
        };
      }

      if (metadata.licenseUris.length) {
        args.license_uris = {
          value: metadata.licenseUris.join(', '),
          type: ArgType.NonCopiable,
        };
      }

      args.edition_number = {
        value: metadata.editionNumber.toString(),
        type: ArgType.NonCopiable,
      };

      args.edition_total = {
        value: metadata.editionTotal.toString(),
        type: ArgType.NonCopiable,
      };
    }

    args.metadata_updater_puzzle_hash = {
      value:
        metadataUpdaterPuzzleHash && `0x${toHex(metadataUpdaterPuzzleHash)}`,
      type: ArgType.Copiable,
    };

    if (innerPuzzle) children.inner_puzzle = parseLayer(innerPuzzle.puzzle());
  } else if (bytesEqual(puzzle.modHash, Constants.nftOwnershipLayerHash())) {
    name = 'NFT_OWNERSHIP_LAYER';

    const currentOwner = arg(1)?.toAtom();
    const transferProgram = arg(2);
    const innerPuzzle = arg(3);

    if (currentOwner) {
      args.current_owner = {
        value: currentOwner.length ? `0x${toHex(currentOwner)}` : 'None',
        type: currentOwner.length ? ArgType.Copiable : ArgType.NonCopiable,
      };
    }

    if (transferProgram)
      children.transfer_program = parseLayer(transferProgram.puzzle());
    if (innerPuzzle) children.inner_puzzle = parseLayer(innerPuzzle.puzzle());
  } else if (
    bytesEqual(
      puzzle.modHash,
      Constants.nftOwnershipTransferProgramOneWayClaimWithRoyaltiesHash(),
    )
  ) {
    name = 'NFT_OWNERSHIP_TRANSFER_PROGRAM_ONE_WAY_CLAIM_WITH_ROYALTIES';

    const royaltyPuzzleHash = arg(1)?.toAtom();
    const royaltyBasisPoints = arg(2)?.toInt();

    args.royalty_address = {
      value: royaltyPuzzleHash && toAddress(toHex(royaltyPuzzleHash)),
      type: ArgType.Copiable,
    };

    args.royalty_basis_points = {
      value: royaltyBasisPoints?.toString(),
      type: ArgType.NonCopiable,
    };
  } else if (
    bytesEqual(puzzle.modHash, Constants.p2SingletonOrDelayedPuzzleHashHash())
  ) {
    name = 'P2_SINGLETON_OR_DELAYED_PUZZLE_HASH';

    const launcherId = arg(1)?.toAtom();
    const secondsDelay = arg(3)?.toInt();
    const delayedPuzzleHash = arg(4)?.toAtom();

    args.launcher_id = {
      value: launcherId && toAddress(toHex(launcherId)),
      type: ArgType.CoinId,
    };

    args.seconds_delay = {
      value: secondsDelay?.toString(),
      type: ArgType.NonCopiable,
    };

    args.delayed_puzzle_hash = {
      value: delayedPuzzleHash && `0x${toHex(delayedPuzzleHash)}`,
      type: ArgType.Copiable,
    };
  }

  return {
    name,
    modHash: `0x${toHex(puzzle.modHash)}`,
    args,
    children,
  };
}
