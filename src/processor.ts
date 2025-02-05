import { LogLevel } from "@sentio/sdk";
import { FuelContractContext, FuelLog, FuelNetwork } from "@sentio/sdk/fuel";

import { DieselAmmContractProcessor } from "./types/fuel/DieselAmmContractProcessor.js";
import {
  BurnEventOutput,
  CreatePoolEventInput,
  CreatePoolEventOutput,
  DieselAmmContract,
  MintEventOutput,
  SwapEventOutput,
} from "./types/fuel/DieselAmmContract.js";
import {
  Balance,
  LPPosition,
  LPPositionSnapshot,
  Pool,
  PoolSnapshot,
  UserScoreSnapshot,
  V2Burns,
  V2Mints,
  V2Transfers,
} from "./schema/store.js";
import {
  calculateFee,
  formatTimestamp,
  getHash,
  getPoolTvl,
  identityToStr,
  poolIdToStr,
  updateBalance,
  updateBalanceByPool,
} from "./utils.js";
import { BN } from "fuels";
import { getPriceBySymbol, token } from "@sentio/sdk/utils";
import { tokenConfig } from "./tokenConfig.js";

const USDC_ID =
  "0x286c479da40dc953bddc3bb4c453b608bba2e0ac483b077bd475174115395e6b";
let ETH_ID =
  "0xf8f8b6283d7fa5b672b530cbb84fcccb4ff8dc40f8176ef4544ddb1f1952ad07";

DieselAmmContractProcessor.bind({
  address: "0x7c293b054938bedca41354203be4c08aec2c3466412cac803f4ad62abf22e476",
  chainId: FuelNetwork.MAIN_NET,
  startBlock: 11000000n,
})
  .onLogCreatePoolEvent(async (log, ctx) => {
    // const pool = new Pool({
    //   id: poolIdToStr(log.data.pool_id),
    //   asset_0: log.data.pool_id[0].bits,
    //   asset_1: log.data.pool_id[1].bits,
    //   is_stable: log.data.pool_id[2],
    //   reserve_0: 0n,
    //   reserve_1: 0n,
    //   create_time: ctx.timestamp.getTime(),
    //   decimals_0: Number(log.data.decimals_0),
    //   decimals_1: Number(log.data.decimals_1),
    // });
    // BigInt(ctx.block?.height.toString()!)

    const asset_0_id = log.data.pool_id[0].bits;
    const asset_1_id = log.data.pool_id[1].bits;
    let index = 0;
    let symbol = "";
    let decimals = 9;
    let address = "";

    if (asset_0_id === ETH_ID || asset_1_id === ETH_ID) {
      symbol = "ETH";
      decimals = 9;
      address = ETH_ID;
      if (asset_0_id === ETH_ID) {
        index = 0;
      } else {
        index = 1;
      }
    } else if (asset_0_id === USDC_ID || asset_1_id === USDC_ID) {
      symbol = "USDC";
      decimals = 6;
      address = USDC_ID;
      if (asset_0_id === USDC_ID) {
        index = 0;
      } else {
        index = 1;
      }
    } else {
      symbol = tokenConfig[asset_0_id].symbol;
      decimals = 9;
      address = asset_0_id;
      index = 0;
    }

    const pool = new Pool({
      id: poolIdToStr(log.data.pool_id),
      chain_id: 1,
      creation_block_number: Number(ctx.transaction?.blockNumber) || 0,
      timestamp: Math.floor(new Date(ctx.timestamp).getTime() / 1000),
      pool_address: poolIdToStr(log.data.pool_id),
      lp_token_address: "na",
      lp_token_symbol: "na",
      token_address: address,
      token_symbol: symbol,
      token_decimals: decimals.toString(),
      token_index: BigInt(index),
      dex_type: "CPMM",
      token_amount: 0,
      volume_amount: 0,
      total_fees_usd: 0,
      volume_usd: 0,
      token_amount_usd: 0,

      asset_0: log.data.pool_id[0].bits,
      asset_1: log.data.pool_id[1].bits,
      is_stable: log.data.pool_id[2],
      reserve_0: 0n,
      reserve_1: 0n,
      decimals_0: Number(log.data.decimals_0),
      decimals_1: Number(log.data.decimals_1),
      fee_rate: log.data.pool_id[2] ? 0.05 : 0.3,
    });
    console.log("LOG FROM PROCESSOR--------------------");
    await ctx.store.upsert(pool);
  })
  .onLogMintEvent(async (log, ctx) => {
    try {
      const asset_0_in = BigInt(log.data.asset_0_in.toString());
      const asset_1_in = BigInt(log.data.asset_1_in.toString());

      const address = log.data.recipient.Address?.bits || "0x";

      const poolId = poolIdToStr(log.data.pool_id);

      const eth_usd = (await getPriceBySymbol("ETH", new Date())) || 3196;
      const usdc_usd = (await getPriceBySymbol("USDC", new Date())) || 1;

      // STORE V2 MINTS
      const mintId = getHash(
        `${address}-${Math.floor(new Date(ctx.timestamp).getTime() / 1000)}`
      );

      if (
        log.data.pool_id[0].bits === ETH_ID ||
        log.data.pool_id[1].bits === ETH_ID
      ) {
        const v2mint = new V2Mints({
          id: mintId,
          timestamp: Math.floor(new Date(ctx.timestamp).getTime() / 1000),
          chain_id: Number(ctx.chainId),
          block_number: Number(ctx.transaction?.blockNumber) || 0,
          log_index: 0,
          transaction_hash: ctx.transaction?.id,
          transaction_from_address: address,
          from_address: ctx.transaction?.sender,
          to_address: address,
          pool_address: poolId,
          token0_address: log.data.pool_id[0].bits,
          token0_amount: Number(asset_0_in),
          token1_address: log.data.pool_id[1].bits,
          token1_amount: Number(asset_1_in),
          mint_amount: Number(log.data.liquidity.amount) / 10 ** 9,
          mint_amount_usd:
            (Number(log.data.liquidity.amount) / 10 ** 9) * eth_usd,
        });

        await ctx.store.upsert(v2mint);
      } else if (
        log.data.pool_id[0].bits === USDC_ID ||
        log.data.pool_id[1].bits === USDC_ID
      ) {
        const v2mint = new V2Mints({
          id: mintId,
          timestamp: Math.floor(new Date(ctx.timestamp).getTime() / 1000),
          chain_id: Number(ctx.chainId),
          block_number: Number(ctx.transaction?.blockNumber) || 0,
          log_index: 0,
          transaction_hash: ctx.transaction?.id,
          transaction_from_address: address,
          from_address: ctx.transaction?.sender,
          to_address: address,
          pool_address: poolId,
          token0_address: log.data.pool_id[0].bits,
          token0_amount: Number(asset_0_in),
          token1_address: log.data.pool_id[1].bits,
          token1_amount: Number(asset_1_in),
          mint_amount: Number(log.data.liquidity.amount) / 10 ** 9,
          mint_amount_usd:
            (Number(log.data.liquidity.amount) / 10 ** 9) * usdc_usd,
        });

        await ctx.store.upsert(v2mint);
      }

      // UPDATE POOL DATA
      const pool = await ctx.store.get(Pool, poolId);

      if (!pool) {
        throw new Error("Pool not found");
      }

      pool.reserve_0 += asset_0_in;
      pool.reserve_1 += asset_1_in;

      pool.lp_token_address = log.data.liquidity.id.bits;
      pool.lp_token_symbol = `${tokenConfig[pool.asset_0!].symbol}-${
        tokenConfig[pool.asset_1!].symbol
      } LP`;

      if (Number(pool.token_index) === 0) {
        pool.token_amount = Number(pool.reserve_0);
        if (pool.asset_0 === ETH_ID) {
          pool.token_amount_usd =
            (Number(pool.reserve_0) / 10 ** pool.decimals_0!) * eth_usd;
        } else if (pool.asset_0 === USDC_ID) {
          pool.token_amount_usd =
            (Number(pool.reserve_0) / 10 ** pool.decimals_0!) * usdc_usd;
        }
      } else {
        pool.token_amount = Number(pool.reserve_1);
        if (pool.asset_1 === ETH_ID) {
          pool.token_amount_usd =
            (Number(pool.reserve_1) / 10 ** pool.decimals_1!) * eth_usd;
        } else if (pool.asset_1 === USDC_ID) {
          pool.token_amount_usd =
            (Number(pool.reserve_1) / 10 ** pool.decimals_1!) * usdc_usd;
        }
      }

      await ctx.store.upsert(pool);

      // UPDATE LP POSITION

      const positionId = getHash(`${address}-${poolIdToStr(log.data.pool_id)}`);
      console.log("PositionID ", positionId);

      let position = await ctx.store.get(LPPosition, positionId);
      let token_amount = 0;
      let token_amount_usd = 0;
      let price_usd = 0;

      if (pool.token_symbol === "ETH" || "USDC") {
        price_usd =
          (await getPriceBySymbol(pool.token_symbol, new Date())) || 0;
      }

      console.log("price", pool.token_symbol, " ", price_usd);

      if (Number(pool.token_index) === 0) {
        token_amount = Number(asset_0_in) / 10 ** pool.decimals_0!;
        token_amount_usd = token_amount * price_usd;
      } else {
        token_amount = Number(asset_1_in) / 10 ** pool.decimals_1!;
        token_amount_usd = token_amount * price_usd;
      }

      if (!position) {
        const newPosition = new LPPosition({
          id: positionId,
          pool_address: poolIdToStr(log.data.pool_id),
          user_address: address,
          token_index: pool.token_index,
          token_address: pool.token_address,
          token_symbol: pool.token_symbol,
          token_amount: token_amount,
          token_amount_usd: token_amount_usd,
        });

        await ctx.store.upsert(newPosition);
      } else {
        position.token_amount! += token_amount;
        position.token_amount_usd! += token_amount_usd;
        await ctx.store.upsert(position);
      }

      // STORE POOL SNAPSHOT

      const { dailySnapshot, hourlySnapshot } = formatTimestamp(ctx.timestamp);
      const dailySnapshotId = getHash(`${log.data.pool_id}_${dailySnapshot}`);
      const hourlySnapshotId = getHash(`${log.data.pool_id}_${hourlySnapshot}`);

      // STORE POOL SNAPSHOT DAILY
      const snapshotDaily = await ctx.store.get(PoolSnapshot, dailySnapshotId);

      if (!snapshotDaily) {
        const newSnapDaily = new PoolSnapshot({
          id: dailySnapshotId,
          chain_id: 1,
          timestamp: Math.floor(new Date(ctx.timestamp).getTime() / 1000),
          pool_address: poolIdToStr(log.data.pool_id),
          block_date: dailySnapshot,
          token_index: pool.token_index,
          token_address: pool.token_address,
          token_symbol: pool.token_symbol,
          token_amount: pool.token_amount,
          token_amount_usd: pool.token_amount_usd,
          volume_amount: pool.volume_amount,
          volume_usd: pool.volume_usd,
          fee_rate: pool.fee_rate,
          total_fees_usd: pool.total_fees_usd,
          user_fees_usd: pool.total_fees_usd,
          protocol_fees_usd: 0,
        });

        await ctx.store.upsert(newSnapDaily);
      } else {
        snapshotDaily.timestamp = Math.floor(
          new Date(ctx.timestamp).getTime() / 1000
        );
        snapshotDaily.block_date = dailySnapshot;
        snapshotDaily.token_amount = pool.token_amount;
        snapshotDaily.token_amount_usd = pool.token_amount_usd;
        snapshotDaily.volume_amount = pool.volume_amount;
        snapshotDaily.volume_usd = pool.volume_usd;
        snapshotDaily.total_fees_usd = pool.total_fees_usd;
        snapshotDaily.user_fees_usd = pool.total_fees_usd;

        await ctx.store.upsert(snapshotDaily);
      }

      // STORE POOL SNAPSHOT Hourly
      const snapshotHourly = await ctx.store.get(
        PoolSnapshot,
        hourlySnapshotId
      );

      if (!snapshotHourly) {
        const newSnapHourly = new PoolSnapshot({
          id: hourlySnapshotId,
          chain_id: 1,
          timestamp: Math.floor(new Date(ctx.timestamp).getTime() / 1000),
          pool_address: poolIdToStr(log.data.pool_id),
          block_date: hourlySnapshot,
          token_index: pool.token_index,
          token_address: pool.token_address,
          token_symbol: pool.token_symbol,
          token_amount: pool.token_amount,
          token_amount_usd: pool.token_amount_usd,
          volume_amount: pool.volume_amount,
          volume_usd: pool.volume_usd,
          fee_rate: pool.fee_rate,
          total_fees_usd: pool.total_fees_usd,
          user_fees_usd: pool.total_fees_usd,
          protocol_fees_usd: 0,
        });

        await ctx.store.upsert(newSnapHourly);
      } else {
        snapshotHourly.timestamp = Math.floor(
          new Date(ctx.timestamp).getTime() / 1000
        );
        snapshotHourly.block_date = hourlySnapshot;
        snapshotHourly.token_amount = pool.token_amount;
        snapshotHourly.token_amount_usd = pool.token_amount_usd;
        snapshotHourly.volume_amount = pool.volume_amount;
        snapshotHourly.volume_usd = pool.volume_usd;
        snapshotHourly.total_fees_usd = pool.total_fees_usd;
        snapshotHourly.user_fees_usd = pool.total_fees_usd;

        await ctx.store.upsert(snapshotHourly);
      }

      // STORE LP SNAPSHOT

      const dailySnapshotIdLP = getHash(
        `${log.data.liquidity.id}_${dailySnapshot}`
      );
      const hourlySnapshotIdLP = getHash(
        `${log.data.liquidity.id}_${hourlySnapshot}`
      );

      // STORE LP SNAPSHOT DAILY
      const snapshotDailyLP = await ctx.store.get(
        LPPositionSnapshot,
        dailySnapshotIdLP
      );

      if (!snapshotDailyLP) {
        const newSnapDaily = new LPPositionSnapshot({
          id: dailySnapshotIdLP,
          chain_id: 1,
          timestamp: Math.floor(new Date(ctx.timestamp).getTime() / 1000),
          pool_address: poolIdToStr(log.data.pool_id),
          user_address: address,
          block_date: dailySnapshot,
          token_index: pool.token_index,
          token_address: pool.token_address,
          token_symbol: pool.token_symbol,
          token_amount: pool.token_amount,
          token_amount_usd: pool.token_amount_usd,
        });

        await ctx.store.upsert(newSnapDaily);
      } else {
        snapshotDailyLP.timestamp = Math.floor(
          new Date(ctx.timestamp).getTime() / 1000
        );
        snapshotDailyLP.block_date = dailySnapshot;
        snapshotDailyLP.token_amount = pool.token_amount;
        snapshotDailyLP.token_amount_usd = pool.token_amount_usd;

        await ctx.store.upsert(snapshotDailyLP);
      }

      // STORE LP SNAPSHOT Hourly
      const snapshotHourlyLP = await ctx.store.get(
        LPPositionSnapshot,
        hourlySnapshotIdLP
      );

      if (!snapshotHourlyLP) {
        const newSnapHourly = new LPPositionSnapshot({
          id: hourlySnapshotIdLP,
          chain_id: 1,
          timestamp: Math.floor(new Date(ctx.timestamp).getTime() / 1000),
          pool_address: poolIdToStr(log.data.pool_id),
          user_address: address,
          block_date: hourlySnapshot,
          token_index: pool.token_index,
          token_address: pool.token_address,
          token_symbol: pool.token_symbol,
          token_amount: pool.token_amount,
          token_amount_usd: pool.token_amount_usd,
        });

        await ctx.store.upsert(newSnapHourly);
      } else {
        snapshotHourlyLP.timestamp = Math.floor(
          new Date(ctx.timestamp).getTime() / 1000
        );
        snapshotHourlyLP.block_date = hourlySnapshot;
        snapshotHourlyLP.token_amount = pool.token_amount;
        snapshotHourlyLP.token_amount_usd = pool.token_amount_usd;

        await ctx.store.upsert(snapshotHourlyLP);
      }

      // STORE USER SCORE SNAPSHOT
      let positionUser = await ctx.store.get(LPPosition, positionId);

      const dailySnapshotIdUser = getHash(`${address}_${dailySnapshot}`);
      const hourlySnapshotIdUser = getHash(`${address}_${hourlySnapshot}`);

      // STORE USER SCORE SNAPSHOT DAILY
      const snapshotDailyUser = await ctx.store.get(
        UserScoreSnapshot,
        dailySnapshotIdUser
      );

      if (!snapshotDailyUser) {
        const newSnapDaily = new UserScoreSnapshot({
          id: dailySnapshotIdUser,
          chain_id: 1,
          timestamp: Math.floor(new Date(ctx.timestamp).getTime() / 1000),
          pool_address: poolIdToStr(log.data.pool_id),
          user_address: address,
          block_number: Number(ctx.transaction?.blockNumber),
          block_date: dailySnapshot,
          total_value_locked_score: positionUser?.token_amount_usd!,
        });

        await ctx.store.upsert(newSnapDaily);
      } else {
        snapshotDailyUser.timestamp = Math.floor(
          new Date(ctx.timestamp).getTime() / 1000
        );
        snapshotDailyUser.block_date = dailySnapshot;
        snapshotDailyUser.total_value_locked_score =
          positionUser?.token_amount_usd!;

        await ctx.store.upsert(snapshotDailyUser);
      }

      // STORE USER SCORE SNAPSHOT Hourly
      const snapshotHourlyUser = await ctx.store.get(
        UserScoreSnapshot,
        hourlySnapshotIdUser
      );

      if (!snapshotHourlyUser) {
        const newSnapHourly = new UserScoreSnapshot({
          id: hourlySnapshotIdUser,
          chain_id: 1,
          timestamp: Math.floor(new Date(ctx.timestamp).getTime() / 1000),
          pool_address: poolIdToStr(log.data.pool_id),
          user_address: address,
          block_number: Number(ctx.transaction?.blockNumber),
          block_date: hourlySnapshot,
          total_value_locked_score: positionUser?.token_amount_usd!,
        });

        await ctx.store.upsert(newSnapHourly);
      } else {
        snapshotHourlyUser.timestamp = Math.floor(
          new Date(ctx.timestamp).getTime() / 1000
        );
        snapshotHourlyUser.block_date = hourlySnapshot;
        snapshotHourlyUser.total_value_locked_score =
          positionUser?.token_amount_usd!;

        await ctx.store.upsert(snapshotHourlyUser);
      }
    } catch (error) {
      console.log("MINT ERROR", error);
    }
  })
  .onLogBurnEvent(async (log, ctx) => {
    try {
      const asset_0_out = BigInt(log.data.asset_0_out.toString());
      const asset_1_out = BigInt(log.data.asset_1_out.toString());
      const address = log.data.recipient.Address?.bits || "0x";

      const poolId = poolIdToStr(log.data.pool_id);

      const eth_usd = (await getPriceBySymbol("ETH", new Date())) || 3196;
      const usdc_usd = (await getPriceBySymbol("USDC", new Date())) || 1;

      // STORE V2 BURNS
      const burnId = getHash(
        `${address}-${Math.floor(new Date(ctx.timestamp).getTime() / 1000)}`
      );

      if (
        log.data.pool_id[0].bits === ETH_ID ||
        log.data.pool_id[1].bits === ETH_ID
      ) {
        const v2Burns = new V2Burns({
          id: burnId,
          timestamp: Math.floor(new Date(ctx.timestamp).getTime() / 1000),
          chain_id: Number(ctx.chainId),
          block_number: Number(ctx.transaction?.blockNumber) || 0,
          log_index: 0,
          transaction_hash: ctx.transaction?.id,
          transaction_from_address: address,
          from_address: ctx.transaction?.sender,
          to_address: address,
          pool_address: poolId,
          token0_address: log.data.pool_id[0].bits,
          token0_amount: Number(asset_0_out),
          token1_address: log.data.pool_id[1].bits,
          token1_amount: Number(asset_1_out),
          burn_amount: Number(log.data.liquidity.amount) / 10 ** 9,
          burn_amount_usd:
            (Number(log.data.liquidity.amount) / 10 ** 9) * eth_usd,
        });

        await ctx.store.upsert(v2Burns);
      } else if (
        log.data.pool_id[0].bits === USDC_ID ||
        log.data.pool_id[1].bits === USDC_ID
      ) {
        const v2Burns = new V2Burns({
          id: burnId,
          timestamp: Math.floor(new Date(ctx.timestamp).getTime() / 1000),
          chain_id: Number(ctx.chainId),
          block_number: Number(ctx.transaction?.blockNumber) || 0,
          log_index: 0,
          transaction_hash: ctx.transaction?.id,
          transaction_from_address: address,
          from_address: ctx.transaction?.sender,
          to_address: address,
          pool_address: poolId,
          token0_address: log.data.pool_id[0].bits,
          token0_amount: Number(asset_0_out),
          token1_address: log.data.pool_id[1].bits,
          token1_amount: Number(asset_1_out),
          burn_amount: Number(log.data.liquidity.amount) / 10 ** 9,
          burn_amount_usd:
            (Number(log.data.liquidity.amount) / 10 ** 9) * usdc_usd,
        });

        await ctx.store.upsert(v2Burns);
      }

      // UPDATE POOL DATA
      const pool = await ctx.store.get(Pool, poolId);

      if (!pool) {
        throw new Error("Pool not found");
      }

      pool.reserve_0 += asset_0_out;
      pool.reserve_1 += asset_1_out;

      pool.lp_token_address = log.data.liquidity.id.bits;
      pool.lp_token_symbol = `${tokenConfig[pool.asset_0!].symbol}-${
        tokenConfig[pool.asset_1!].symbol
      } LP`;

      if (Number(pool.token_index) === 0) {
        pool.token_amount = Number(pool.reserve_0);
        if (pool.asset_0 === ETH_ID) {
          pool.token_amount_usd =
            (Number(pool.reserve_0) / 10 ** pool.decimals_0!) * eth_usd;
        } else if (pool.asset_0 === USDC_ID) {
          pool.token_amount_usd =
            (Number(pool.reserve_0) / 10 ** pool.decimals_0!) * usdc_usd;
        }
      } else {
        pool.token_amount = Number(pool.reserve_1);
        if (pool.asset_1 === ETH_ID) {
          pool.token_amount_usd =
            (Number(pool.reserve_1) / 10 ** pool.decimals_1!) * eth_usd;
        } else if (pool.asset_1 === USDC_ID) {
          pool.token_amount_usd =
            (Number(pool.reserve_1) / 10 ** pool.decimals_1!) * usdc_usd;
        }
      }

      await ctx.store.upsert(pool);

      // UPDATE LP POSITION

      const positionId = getHash(`${address}-${poolIdToStr(log.data.pool_id)}`);
      console.log("PositionID ", positionId);

      let position = await ctx.store.get(LPPosition, positionId);
      let token_amount = 0;
      let token_amount_usd = 0;

      const price_usd =
        (await getPriceBySymbol(pool.token_symbol, new Date())) || 0;
      console.log("price", pool.token_symbol, " ", price_usd);

      if (Number(pool.token_index) === 0) {
        token_amount = Number(asset_0_out) / 10 ** pool.decimals_0!;
        token_amount_usd = token_amount * price_usd;
      } else {
        token_amount = Number(asset_1_out) / 10 ** pool.decimals_1!;
        token_amount_usd = token_amount * price_usd;
      }

      if (!position) {
        const newPosition = new LPPosition({
          id: positionId,
          pool_address: poolIdToStr(log.data.pool_id),
          user_address: address,
          token_index: pool.token_index,
          token_address: pool.token_address,
          token_symbol: pool.token_symbol,
          token_amount: token_amount,
          token_amount_usd: token_amount_usd,
        });

        await ctx.store.upsert(newPosition);
      } else {
        position!.token_amount! -= token_amount;
        position!.token_amount_usd! -= token_amount_usd;
        await ctx.store.upsert(position!);
      }

      // STORE POOL SNAPSHOT

      const { dailySnapshot, hourlySnapshot } = formatTimestamp(ctx.timestamp);
      const dailySnapshotId = getHash(`${log.data.pool_id}_${dailySnapshot}`);
      const hourlySnapshotId = getHash(`${log.data.pool_id}_${hourlySnapshot}`);

      // STORE POOL SNAPSHOT DAILY
      const snapshotDaily = await ctx.store.get(PoolSnapshot, dailySnapshot);

      if (!snapshotDaily) {
        const newSnapDaily = new PoolSnapshot({
          id: dailySnapshotId,
          chain_id: 1,
          timestamp: Math.floor(new Date(ctx.timestamp).getTime() / 1000),
          pool_address: poolIdToStr(log.data.pool_id),
          block_date: dailySnapshot,
          token_index: pool.token_index,
          token_address: pool.token_address,
          token_symbol: pool.token_symbol,
          token_amount: pool.token_amount,
          token_amount_usd: pool.token_amount_usd,
          volume_amount: pool.volume_amount,
          volume_usd: pool.volume_usd,
          fee_rate: pool.fee_rate,
          total_fees_usd: pool.total_fees_usd,
          user_fees_usd: pool.total_fees_usd,
          protocol_fees_usd: 0,
        });

        await ctx.store.upsert(newSnapDaily);
      } else {
        snapshotDaily.timestamp = Math.floor(
          new Date(ctx.timestamp).getTime() / 1000
        );
        snapshotDaily.block_date = dailySnapshot;
        snapshotDaily.token_amount = pool.token_amount;
        snapshotDaily.token_amount_usd = pool.token_amount_usd;
        snapshotDaily.volume_amount = pool.volume_amount;
        snapshotDaily.volume_usd = pool.volume_usd;
        snapshotDaily.total_fees_usd = pool.total_fees_usd;
        snapshotDaily.user_fees_usd = pool.total_fees_usd;

        await ctx.store.upsert(snapshotDaily);
      }

      // STORE POOL SNAPSHOT Hourly
      const snapshotHourly = await ctx.store.get(
        PoolSnapshot,
        hourlySnapshotId
      );

      if (!snapshotHourly) {
        const newSnapHourly = new PoolSnapshot({
          id: hourlySnapshotId,
          chain_id: 1,
          timestamp: Math.floor(new Date(ctx.timestamp).getTime() / 1000),
          pool_address: poolIdToStr(log.data.pool_id),
          block_date: hourlySnapshot,
          token_index: pool.token_index,
          token_address: pool.token_address,
          token_symbol: pool.token_symbol,
          token_amount: pool.token_amount,
          token_amount_usd: pool.token_amount_usd,
          volume_amount: pool.volume_amount,
          volume_usd: pool.volume_usd,
          fee_rate: pool.fee_rate,
          total_fees_usd: pool.total_fees_usd,
          user_fees_usd: pool.total_fees_usd,
          protocol_fees_usd: 0,
        });

        await ctx.store.upsert(newSnapHourly);
      } else {
        snapshotHourly.timestamp = Math.floor(
          new Date(ctx.timestamp).getTime() / 1000
        );
        snapshotHourly.block_date = hourlySnapshot;
        snapshotHourly.token_amount = pool.token_amount;
        snapshotHourly.token_amount_usd = pool.token_amount_usd;
        snapshotHourly.volume_amount = pool.volume_amount;
        snapshotHourly.volume_usd = pool.volume_usd;
        snapshotHourly.total_fees_usd = pool.total_fees_usd;
        snapshotHourly.user_fees_usd = pool.total_fees_usd;

        await ctx.store.upsert(snapshotHourly);
      }

      // STORE LP SNAPSHOT

      const dailySnapshotIdLP = getHash(
        `${log.data.liquidity.id}_${dailySnapshot}`
      );
      const hourlySnapshotIdLP = getHash(
        `${log.data.liquidity.id}_${hourlySnapshot}`
      );

      // STORE LP SNAPSHOT DAILY
      const snapshotDailyLP = await ctx.store.get(
        LPPositionSnapshot,
        dailySnapshotIdLP
      );

      if (!snapshotDailyLP) {
        const newSnapDaily = new LPPositionSnapshot({
          id: dailySnapshotIdLP,
          chain_id: 1,
          timestamp: Math.floor(new Date(ctx.timestamp).getTime() / 1000),
          pool_address: poolIdToStr(log.data.pool_id),
          user_address: address,
          block_date: dailySnapshot,
          token_index: pool.token_index,
          token_address: pool.token_address,
          token_symbol: pool.token_symbol,
          token_amount: pool.token_amount,
          token_amount_usd: pool.token_amount_usd,
        });

        await ctx.store.upsert(newSnapDaily);
      } else {
        snapshotDailyLP.timestamp = Math.floor(
          new Date(ctx.timestamp).getTime() / 1000
        );
        snapshotDailyLP.block_date = dailySnapshot;
        snapshotDailyLP.token_amount = pool.token_amount;
        snapshotDailyLP.token_amount_usd = pool.token_amount_usd;

        await ctx.store.upsert(snapshotDailyLP);
      }

      // STORE LP SNAPSHOT Hourly
      const snapshotHourlyLP = await ctx.store.get(
        LPPositionSnapshot,
        hourlySnapshotIdLP
      );

      if (!snapshotHourlyLP) {
        const newSnapHourly = new LPPositionSnapshot({
          id: hourlySnapshotIdLP,
          chain_id: 1,
          timestamp: Math.floor(new Date(ctx.timestamp).getTime() / 1000),
          pool_address: poolIdToStr(log.data.pool_id),
          user_address: address,
          block_date: hourlySnapshot,
          token_index: pool.token_index,
          token_address: pool.token_address,
          token_symbol: pool.token_symbol,
          token_amount: pool.token_amount,
          token_amount_usd: pool.token_amount_usd,
        });

        await ctx.store.upsert(newSnapHourly);
      } else {
        snapshotHourlyLP.timestamp = Math.floor(
          new Date(ctx.timestamp).getTime() / 1000
        );
        snapshotHourlyLP.block_date = hourlySnapshot;
        snapshotHourlyLP.token_amount = pool.token_amount;
        snapshotHourlyLP.token_amount_usd = pool.token_amount_usd;

        await ctx.store.upsert(snapshotHourlyLP);
      }

      // STORE USER SCORE SNAPSHOT
      let positionUser = await ctx.store.get(LPPosition, positionId);

      const dailySnapshotIdUser = getHash(`${address}_${dailySnapshot}`);
      const hourlySnapshotIdUser = getHash(`${address}_${hourlySnapshot}`);

      // STORE USER SCORE SNAPSHOT DAILY
      const snapshotDailyUser = await ctx.store.get(
        UserScoreSnapshot,
        dailySnapshotIdUser
      );

      if (!snapshotDailyUser) {
        const newSnapDaily = new UserScoreSnapshot({
          id: dailySnapshotIdUser,
          chain_id: 1,
          timestamp: Math.floor(new Date(ctx.timestamp).getTime() / 1000),
          pool_address: poolIdToStr(log.data.pool_id),
          user_address: address,
          block_date: dailySnapshot,
          block_number: Number(ctx.transaction?.blockNumber),
          total_value_locked_score: positionUser?.token_amount_usd!,
        });

        await ctx.store.upsert(newSnapDaily);
      } else {
        snapshotDailyUser.timestamp = Math.floor(
          new Date(ctx.timestamp).getTime() / 1000
        );
        snapshotDailyUser.block_date = dailySnapshot;
        snapshotDailyUser.total_value_locked_score =
          positionUser?.token_amount_usd!;

        await ctx.store.upsert(snapshotDailyUser);
      }

      // STORE USER SCORE SNAPSHOT Hourly
      const snapshotHourlyUser = await ctx.store.get(
        UserScoreSnapshot,
        hourlySnapshotIdUser
      );

      if (!snapshotHourlyUser) {
        const newSnapHourly = new UserScoreSnapshot({
          id: hourlySnapshotIdUser,
          chain_id: 1,
          timestamp: Math.floor(new Date(ctx.timestamp).getTime() / 1000),
          pool_address: poolIdToStr(log.data.pool_id),
          user_address: address,
          block_date: hourlySnapshot,
          block_number: Number(ctx.transaction?.blockNumber),
          total_value_locked_score: positionUser?.token_amount_usd!,
        });

        await ctx.store.upsert(newSnapHourly);
      } else {
        snapshotHourlyUser.timestamp = Math.floor(
          new Date(ctx.timestamp).getTime() / 1000
        );
        snapshotHourlyUser.block_date = hourlySnapshot;
        snapshotHourlyUser.total_value_locked_score =
          positionUser?.token_amount_usd!;

        await ctx.store.upsert(snapshotHourlyUser);
      }
    } catch (error) {
      console.log("BURN EVENT Error", error);
    }
  })
  .onLogSwapEvent(
    async (
      log: FuelLog<SwapEventOutput>,
      ctx: FuelContractContext<DieselAmmContract>
    ) => {
      try {
        const asset_0_in = BigInt(log.data.asset_0_in.toString());
        const asset_1_in = BigInt(log.data.asset_1_in.toString());
        const asset_0_out = BigInt(log.data.asset_0_out.toString());
        const asset_1_out = BigInt(log.data.asset_1_out.toString());
        const asset0Id = log.data.pool_id[0].bits;
        const asset1Id = log.data.pool_id[1].bits;
        const eth_usd = (await getPriceBySymbol("ETH", new Date())) || 3196;
        const usdc_usd = (await getPriceBySymbol("USDC", new Date())) || 1;
        let vol = 0;
        let fees = 0;

        const poolId = poolIdToStr(log.data.pool_id);

        // UPDATE POOL DATA
        const pool = await ctx.store.get(Pool, poolId);

        if (!pool) {
          throw new Error("Pool not found");
        }

        pool.reserve_0 += asset_0_in - asset_0_out;
        pool.reserve_1 += asset_1_in - asset_1_out;

        if (Number(pool.token_index) === 0) {
          pool.token_amount = Number(pool.reserve_0);
          if (pool.asset_0 === ETH_ID) {
            pool.token_amount_usd =
              (Number(pool.reserve_0) / 10 ** pool.decimals_0!) * eth_usd;
          } else if (pool.asset_0 === USDC_ID) {
            pool.token_amount_usd =
              (Number(pool.reserve_0) / 10 ** pool.decimals_0!) * usdc_usd;
          }
        } else {
          pool.token_amount = Number(pool.reserve_1);
          if (pool.asset_1 === ETH_ID) {
            pool.token_amount_usd =
              (Number(pool.reserve_1) / 10 ** pool.decimals_1!) * eth_usd;
          } else if (pool.asset_1 === USDC_ID) {
            pool.token_amount_usd =
              (Number(pool.reserve_1) / 10 ** pool.decimals_1!) * usdc_usd;
          }
        }

        let vol_usd = 0;

        if (Number(asset_0_in) > 0) {
          vol =
            Number(asset_0_in) / 10 ** pool.decimals_0! +
            Number(asset_1_out) / 10 ** pool.decimals_1!;

          fees =
            Number(calculateFee(pool?.is_stable!, BigInt(asset_0_in))) /
            10 ** pool.decimals_0!;

          if (asset0Id === ETH_ID) {
            fees = fees * eth_usd;
          } else if (asset0Id === USDC_ID) fees = fees * usdc_usd;
        } else if (Number(asset_1_in) > 0) {
          vol =
            Number(asset_1_in) / 10 ** pool.decimals_1! +
            Number(asset_0_out) / 10 ** pool.decimals_0!;

          fees =
            Number(calculateFee(pool?.is_stable!, BigInt(asset_1_in))) /
            10 ** pool.decimals_1!;

          if (asset1Id === ETH_ID) {
            fees = fees * eth_usd;
          } else if (asset1Id === USDC_ID) fees = fees * usdc_usd;
        }

        if (pool.asset_0 === ETH_ID || pool.asset_1 === ETH_ID) {
          vol_usd = vol * eth_usd;
        } else if (pool.asset_0 === USDC_ID || pool.asset_1 === USDC_ID) {
          vol_usd = vol * usdc_usd;
        }

        pool.total_fees_usd! += fees;
        pool.volume_amount += vol;
        pool.volume_usd! += vol_usd;

        await ctx.store.upsert(pool);

        // STORE POOL SNAPSHOT

        const { dailySnapshot, hourlySnapshot } = formatTimestamp(
          ctx.timestamp
        );
        const dailySnapshotId = getHash(`${log.data.pool_id}_${dailySnapshot}`);
        const hourlySnapshotId = getHash(
          `${log.data.pool_id}_${hourlySnapshot}`
        );

        // STORE POOL SNAPSHOT DAILY
        const snapshotDaily = await ctx.store.get(PoolSnapshot, dailySnapshot);

        if (!snapshotDaily) {
          const newSnapDaily = new PoolSnapshot({
            id: dailySnapshotId,
            chain_id: 1,
            timestamp: Math.floor(new Date(ctx.timestamp).getTime() / 1000),
            pool_address: poolIdToStr(log.data.pool_id),
            block_date: dailySnapshot,
            token_index: pool.token_index,
            token_address: pool.token_address,
            token_symbol: pool.token_symbol,
            token_amount: pool.token_amount,
            token_amount_usd: pool.token_amount_usd,
            volume_amount: pool.volume_amount,
            volume_usd: pool.volume_usd,
            fee_rate: pool.fee_rate,
            total_fees_usd: pool.total_fees_usd,
            user_fees_usd: pool.total_fees_usd,
            protocol_fees_usd: 0,
          });

          await ctx.store.upsert(newSnapDaily);
        } else {
          snapshotDaily.timestamp = Math.floor(
            new Date(ctx.timestamp).getTime() / 1000
          );
          snapshotDaily.block_date = dailySnapshot;
          snapshotDaily.token_amount = pool.token_amount;
          snapshotDaily.token_amount_usd = pool.token_amount_usd;
          snapshotDaily.volume_amount = pool.volume_amount;
          snapshotDaily.volume_usd = pool.volume_usd;
          snapshotDaily.total_fees_usd = pool.total_fees_usd;
          snapshotDaily.user_fees_usd = pool.total_fees_usd;

          await ctx.store.upsert(snapshotDaily);
        }

        // STORE POOL SNAPSHOT Hourly
        const snapshotHourly = await ctx.store.get(
          PoolSnapshot,
          hourlySnapshotId
        );

        if (!snapshotHourly) {
          const newSnapHourly = new PoolSnapshot({
            id: hourlySnapshotId,
            chain_id: 1,
            timestamp: Math.floor(new Date(ctx.timestamp).getTime() / 1000),
            pool_address: poolIdToStr(log.data.pool_id),
            block_date: hourlySnapshot,
            token_index: pool.token_index,
            token_address: pool.token_address,
            token_symbol: pool.token_symbol,
            token_amount: pool.token_amount,
            token_amount_usd: pool.token_amount_usd,
            volume_amount: pool.volume_amount,
            volume_usd: pool.volume_usd,
            fee_rate: pool.fee_rate,
            total_fees_usd: pool.total_fees_usd,
            user_fees_usd: pool.total_fees_usd,
            protocol_fees_usd: 0,
          });

          await ctx.store.upsert(newSnapHourly);
        } else {
          snapshotHourly.timestamp = Math.floor(
            new Date(ctx.timestamp).getTime() / 1000
          );
          snapshotHourly.block_date = hourlySnapshot;
          snapshotHourly.token_amount = pool.token_amount;
          snapshotHourly.token_amount_usd = pool.token_amount_usd;
          snapshotHourly.volume_amount = pool.volume_amount;
          snapshotHourly.volume_usd = pool.volume_usd;
          snapshotHourly.total_fees_usd = pool.total_fees_usd;
          snapshotHourly.user_fees_usd = pool.total_fees_usd;

          await ctx.store.upsert(snapshotHourly);
        }
      } catch (error) {
        console.log("SWAP EVENT ERROR", error);
      }
    }
  )
  .onTransfer({}, async (log, ctx) => {
    // STORE V2 TRANSFERS
    const transferId = getHash(
      `${log.assetId}-${Math.floor(new Date(ctx.timestamp).getTime() / 1000)}`
    );

    const v2Transfer = new V2Transfers({
      id: transferId,
      timestamp: Math.floor(new Date(ctx.timestamp).getTime() / 1000),
      chain_id: Number(ctx.chainId),
      block_number: Number(ctx.transaction?.blockNumber) || 0,
      log_index: 0,
      transaction_hash: ctx.transaction?.id,
      transaction_from_address: log.id,
      from_address: ctx.transaction?.sender,
      to_address: log.to,
      pool_address: log.assetId,
      token_amount: Number(log.amount) / 10 ** 9,
    });

    await ctx.store.upsert(v2Transfer);
  });
//   .onTimeInterval(
//     async (block: any, ctx: FuelContractContext<DieselAmmContract>) => {
//       try {
//         console.log("FROM TIMEREDFFDUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUU");
//         const pool = await ctx.store.get(
//           Pool,
//           "0x1d5d97005e41cae2187a895fd8eab0506111e0e2f3331cd3912c15c24e3c1d82_0x286c479da40dc953bddc3bb4c453b608bba2e0ac483b077bd475174115395e6b_false"
//         );
//         console.log("POOL", pool);
//         for await (const pool of ctx.store.listIterator(Pool, [])) {
//           console.log("ITERATOR", pool.id);
//         }

//         // pools.forEach(async (pool: Pool, i: any) => {
//         //   const poolSnap = await ctx.store.get(PoolSnapshot, pool.id);
//         //   if (!poolSnap) {
//         //     const poolSnap = new PoolSnapshot({
//         //       id: pool.id,
//         //       timestamp: Math.floor(new Date(ctx.timestamp).getTime() / 1000),
//         //       block_date: new Date(ctx.timestamp)
//         //         .toISOString()
//         //         .slice(0, 19)
//         //         .replace("T", " "),
//         //       chain_id: Number(ctx.chainId),
//         //       pool_address: poolIdToStr(pool.id),
//         //       token_index: 0n,
//         //       token_address: "to be defined",
//         //       token_symbol: "ETH",
//         //       token_amount: 0,
//         //       token_amount_usd: 0,
//         //       volume_amount: pool.volume_amount,
//         //       fee_rate: pool.fee_rate,
//         //       total_fees_usd: pool.total_fees_usd,
//         //       user_fees_usd: pool.total_fees_usd,
//         //       protocol_fees_usd: 0,
//         //     });

//         //     await ctx.store.upsert(poolSnap);
//         //     return;
//         //   }
//         //   poolSnap.id = pool.id;
//         //   poolSnap.timestamp = Math.floor(
//         //     new Date(ctx.timestamp).getTime() / 1000
//         //   );
//         //   poolSnap.block_date = new Date(ctx.timestamp)
//         //     .toISOString()
//         //     .slice(0, 19)
//         //     .replace("T", " ");
//         //   poolSnap.chain_id = Number(ctx.chainId);
//         //   poolSnap.pool_address = poolIdToStr(pool.id);
//         //   poolSnap.token_index = 0n;
//         //   poolSnap.token_address = "to be defined";
//         //   poolSnap.token_symbol = "ETH";
//         //   poolSnap.token_amount = 0;
//         //   poolSnap.token_amount_usd = 0;
//         //   poolSnap.volume_amount = pool.volume_amount;
//         //   poolSnap.fee_rate = pool.fee_rate;
//         //   poolSnap.total_fees_usd = pool.total_fees_usd;
//         //   poolSnap.user_fees_usd = pool.total_fees_usd;
//         //   poolSnap.protocol_fees_usd = 0;

//         //   await ctx.store.upsert(poolSnap);
//         // });
//       } catch (error) {
//         console.log("TIME INTERVAL ERROR", error);
//       }
//     },
//     60,
//     60
//   );
// // .onTimeInterval(
// //   async (block, ctx) => {
// //     console.log("FROM TIMEREDFFDUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUU");
// //       const pools = await ctx.store.list(Pool)

// // pools.forEach((pool, i) => {
// //   const poolSnapshot = new PoolSnapshot({
// //     id: pool.id,
// //     timestamp: Math.floor(new Date(ctx.timestamp).getTime() / 1000),
// //     block_date: new Date(ctx.timestamp).toISOString().slice(0, 19).replace('T', ' '),
// //     chain_id: Number(ctx.chainId),
// //     pool_address: poolIdToStr(pool.id),
// //     token_index: 0n,
// //     token_address: pool.lp_token_address,

// // })

// //   }}),
// //   60,
// //   60
// // );

// // import { LogLevel } from "@sentio/sdk";
// // import { FuelContractContext, FuelLog, FuelNetwork } from "@sentio/sdk/fuel";

// // import { DieselAmmContractProcessor } from "./types/fuel/DieselAmmContractProcessor.js";
// // import {
// //   BurnEventOutput,
// //   CreatePoolEventInput,
// //   DieselAmmContract,
// //   MintEventOutput,
// //   SwapEventOutput,
// // } from "./types/fuel/DieselAmmContract.js";
// // import { Balance, MainPrice, Pool, PoolSnapshot } from "./schema/store.js";
// // import {
// //   getHash,
// //   getPoolTvl,
// //   identityToStr,
// //   poolIdToStr,
// //   updateBalance,
// //   updateBalanceByPool,
// // } from "./utils.js";
// // import { BN } from "fuels";
// // import { getPriceBySymbol } from "@sentio/sdk/utils";
// // import axios from "axios";

// // const USDC_ID =
// //   "0x286c479da40dc953bddc3bb4c453b608bba2e0ac483b077bd475174115395e6b";
// // let ETH_ID =
// //   "0xf8f8b6283d7fa5b672b530cbb84fcccb4ff8dc40f8176ef4544ddb1f1952ad07";

// // DieselAmmContractProcessor.bind({
// //   address: "0x7c293b054938bedy41354203be4c08aec2c3466412cac803f4ad62abf22e476",
// //   chainId: FuelNetwork.MAIN_NET,
// // })
// //   .onLogCreatePoolEvent(
// //     async (
// //       log: FuelLog<CreatePoolEventInput>,
// //       ctx: FuelContractContext<DieselAmmContract>
// //     ) => {
// //       // const pool = new Pool({
// //       //   id: poolIdToStr(log.data.pool_id),
// //       //   asset_0: log.data.pool_id[0].bits,
// //       //   asset_1: log.data.pool_id[1].bits,
// //       //   is_stable: log.data.pool_id[2],
// //       //   reserve_0: 0n,
// //       //   reserve_1: 0n,
// //       //   create_time: ctx.timestamp.getTime(),
// //       //   decimals_0: Number(log.data.decimals_0),
// //       //   decimals_1: Number(log.data.decimals_1),
// //       // });
// //       // BigInt(ctx.block?.height.toString()!)

// //       const pool = new Pool({
// //         id: poolIdToStr(log.data.pool_id),
// //         chain_id: 1,
// //         creation_block_number: 0n,
// //         timestamp: 0n,
// //         pool_address: poolIdToStr(log.data.pool_id),
// //         lp_token_address: "na",
// //         lp_token_symbol: "na",
// //         token_address: "na",
// //         token_symbol: "na",
// //         token_decimals: "na",
// //         token_index: "na",
// //         dex_type: "na",

// //         asset_0: log.data.pool_id[0].bits,
// //         asset_1: log.data.pool_id[1].bits,
// //         is_stable: log.data.pool_id[2],
// //         reserve_0: 0n,
// //         reserve_1: 0n,
// //         decimals_0: Number(log.data.decimals_0),
// //         decimals_1: Number(log.data.decimals_1),
// //       });
// //       console.log("LOG FROM PROCESSOR--------------------");

// //       await ctx.store.upsert(pool);
// //     }
// //   )
// //   .onLogMintEvent(
// //     async (
// //       log: FuelLog<MintEventOutput>,
// //       ctx: FuelContractContext<DieselAmmContract>
// //     ) => {
// //       const asset_0_in = log.data.asset_0_in;
// //       const asset_1_in = log.data.asset_1_in;
// //       const asset0Id = log.data.pool_id[0].bits;
// //       const asset1Id = log.data.pool_id[1].bits;

// //       const eth_usd = (await getPriceBySymbol("ETH", new Date())) || 3196;
// //       const usdc_usd = (await getPriceBySymbol("USDC", new Date())) || 1;
// //       const poolId = poolIdToStr(log.data.pool_id);

// //       // get pool by id
// //       const pool = await ctx.store.get(Pool, poolId);

// //       if (!pool) {
// //         throw new Error("Pool not found");
// //       }

// //       pool.reserve_0 = pool.reserve_0! + BigInt(asset_0_in.toString());
// //       pool.reserve_1 = pool.reserve_1! + BigInt(asset_1_in.toString());

// //       // if (pool.asset_0 === ETH_ID || pool.asset_1 === ETH_ID) {
// //       //   if (pool.asset_0 === ETH_ID) {
// //       //     const asset_0_usd = new BN(pool.reserve_0!.toString())
// //       //       .div(10 ** pool.decimals_0!)
// //       //       .mul(eth_usd!);
// //       //     console.log("ASSET OOSDOSDOSDO", asset_0_usd);

// //       //     const tvl_usd = asset_0_usd.mul(2);

// //       //     pool.tvl_usd = Number(tvl_usd.toString());
// //       //   } else {
// //       //     const asset_1_usd = new BN(pool.reserve_1!.toString())
// //       //       .div(10 ** pool.decimals_1!)
// //       //       .mul(eth_usd!);
// //       //     const tvl_usd = asset_1_usd.mul(2);
// //       //     console.log(asset_1_usd);

// //       //     pool.tvl_usd = Number(tvl_usd.toString());
// //       //   }
// //       // } else if (pool.asset_0 === USDC_ID || pool.asset_1 === USDC_ID) {
// //       //   if (pool.asset_0 === USDC_ID) {
// //       //     const asset_0_usd = new BN(pool.reserve_0!.toString())
// //       //       .div(10 ** pool.decimals_0!)
// //       //       .mul(usdc_usd!);
// //       //     const tvl_usd = asset_0_usd.mul(2);
// //       //     console.log(asset_0_usd);

// //       //     pool.tvl_usd = Number(tvl_usd.toString());
// //       //   } else {
// //       //     const asset_1_usd = new BN(pool.reserve_1!.toString())
// //       //       .div(10 ** pool.decimals_1!)
// //       //       .mul(usdc_usd!);
// //       //     const tvl_usd = asset_1_usd.mul(2);
// //       //     console.log(asset_1_usd);

// //       //     pool.tvl_usd = Number(tvl_usd.toString());
// //       //   }
// //       // }

// //       const lp_token_address = log.data.liquidity.id.bits;
// //       // const lp_token_symbol =
// //       // const [address, isContract] = identityToStr(log.data.recipient);

// //       // const balanceId = getHash(`${address}-${ctx.contractAddress}`);
// //       // console.log(address);
// //       // let balance = await ctx.store.get(Balance, balanceId);

// //       // await updateBalanceByPool(
// //       //   log.data.recipient.Address?.bits!,
// //       //   poolId,
// //       //   asset0Id,
// //       //   asset1Id,
// //       //   asset0In,
// //       //   asset1In,
// //       //   balance,
// //       //   balanceId,
// //       //   ctx
// //       // );

// //       await ctx.store.upsert(pool);
// //     }
// //   )
// //   .onLogBurnEvent(
// //     async (
// //       log: FuelLog<BurnEventOutput>,
// //       ctx: FuelContractContext<DieselAmmContract>
// //     ) => {
// //       const eth_usd = (await getPriceBySymbol("ETH", new Date())) || 3196;
// //       const usdc_usd = (await getPriceBySymbol("USDC", new Date())) || 1;

// //       const asset_0_out = log.data.asset_0_out.toString();
// //       const asset_1_out = log.data.asset_1_out.toString();
// //       const asset0Id = log.data.pool_id[0].bits;
// //       const asset1Id = log.data.pool_id[1].bits;
// //       const poolId = poolIdToStr(log.data.pool_id);

// //       const pool = await ctx.store.get(Pool, poolId);

// //       if (!pool) {
// //         throw new Error(`Pool with ID ${poolId} not found`);
// //       }

// //       pool.reserve_0 = pool.reserve_0! - BigInt(asset_0_out.toString());
// //       pool.reserve_1 = pool.reserve_1! - BigInt(asset_1_out.toString());

// //       // if (pool.asset_0 === ETH_ID || pool.asset_1 === ETH_ID) {
// //       //   if (pool.asset_0 === ETH_ID) {
// //       //     const asset_0_usd = new BN(pool.reserve_0!.toString())
// //       //       .div(10 ** pool.decimals_0!)
// //       //       .mul(eth_usd!);
// //       //     console.log("ASSET OOSDOSDOSDO", asset_0_usd);

// //       //     const tvl_usd = asset_0_usd.mul(2);

// //       //     pool.tvl_usd = Number(tvl_usd.toString());
// //       //   } else {
// //       //     const asset_1_usd = new BN(pool.reserve_1!.toString())
// //       //       .div(10 ** pool.decimals_1!)
// //       //       .mul(eth_usd!);
// //       //     const tvl_usd = asset_1_usd.mul(2);
// //       //     console.log(asset_1_usd);

// //       //     pool.tvl_usd = Number(tvl_usd.toString());
// //       //   }
// //       // } else if (pool.asset_0 === USDC_ID || pool.asset_1 === USDC_ID) {
// //       //   if (pool.asset_0 === USDC_ID) {
// //       //     const asset_0_usd = new BN(pool.reserve_0!.toString())
// //       //       .div(10 ** pool.decimals_0!)
// //       //       .mul(usdc_usd!);
// //       //     const tvl_usd = asset_0_usd.mul(2);
// //       //     console.log(asset_0_usd);

// //       //     pool.tvl_usd = Number(tvl_usd.toString());
// //       //   } else {
// //       //     const asset_1_usd = new BN(pool.reserve_1!.toString())
// //       //       .div(10 ** pool.decimals_1!)
// //       //       .mul(usdc_usd!);
// //       //     const tvl_usd = asset_1_usd.mul(2);
// //       //     console.log(asset_1_usd);

// //       //     pool.tvl_usd = Number(tvl_usd.toString());
// //       //   }
// //       // }

// //       // if (
// //       //   pool.reserve_0 < BigInt(asset0out) ||
// //       //   pool.reserve_1 < BigInt(asset1out)
// //       // ) {
// //       //   throw new Error(
// //       //     `reserve0: ${pool.reserve_0} reserve1: ${pool.reserve_1} Insufficient reserves in pool ${poolId}`
// //       //   );
// //       // }

// //       // pool.reserve_0 = pool.reserve_0 - BigInt(asset0out);
// //       // pool.reserve_1 = pool.reserve_1 - BigInt(asset1out);
// //       // pool.create_time = pool.create_time ?? ctx.timestamp;
// //       // pool.lpId = log.data.liquidity.id.bits;

// //       await ctx.store.upsert(pool);
// //     }
// //   )
// //   .onLogSwapEvent(
// //     async (
// //       log: FuelLog<SwapEventOutput>,
// //       ctx: FuelContractContext<DieselAmmContract>
// //     ) => {
// //       const eth_usd = (await getPriceBySymbol("ETH", new Date())) || 3196;
// //       const usdc_usd = (await getPriceBySymbol("USDC", new Date())) || 1;

// //       const asset_0_in = log.data.asset_0_in.toString();
// //       const asset_1_in = log.data.asset_1_in.toString();
// //       const asset_0_out = log.data.asset_0_out.toString();
// //       const asset_1_out = log.data.asset_1_out.toString();
// //       const asset0Id = log.data.pool_id[0].bits;
// //       const asset1Id = log.data.pool_id[1].bits;
// //       const poolId = poolIdToStr(log.data.pool_id);

// //       const pool = await ctx.store.get(Pool, poolId);

// //       if (!pool) {
// //         throw new Error(`Pool with ID ${poolId} not found`);
// //       }

// //       pool.reserve_0 =
// //         pool.reserve_0! + BigInt(asset_0_in) - BigInt(asset_0_out);
// //       pool.reserve_1 =
// //         pool.reserve_1! + BigInt(asset_1_in) - BigInt(asset_1_out);

// //       // if (pool.asset_0 === ETH_ID || pool.asset_1 === ETH_ID) {
// //       //   if (pool.asset_0 === ETH_ID) {
// //       //     const asset_0_usd = new BN(pool.reserve_0!.toString())
// //       //       .div(10 ** pool.decimals_0!)
// //       //       .mul(eth_usd!);
// //       //     console.log("ASSET OOSDOSDOSDO", asset_0_usd);

// //       //     const tvl_usd = asset_0_usd.mul(2);

// //       //     pool.tvl_usd = Number(tvl_usd.toString());
// //       //   } else {
// //       //     const asset_1_usd = new BN(pool.reserve_1!.toString())
// //       //       .div(10 ** pool.decimals_1!)
// //       //       .mul(eth_usd!);
// //       //     const tvl_usd = asset_1_usd.mul(2);
// //       //     console.log(asset_1_usd);

// //       //     pool.tvl_usd = Number(tvl_usd.toString());
// //       //   }
// //       // } else if (pool.asset_0 === USDC_ID || pool.asset_1 === USDC_ID) {
// //       //   if (pool.asset_0 === USDC_ID) {
// //       //     const asset_0_usd = new BN(pool.reserve_0!.toString())
// //       //       .div(10 ** pool.decimals_0!)
// //       //       .mul(usdc_usd!);
// //       //     const tvl_usd = asset_0_usd.mul(2);
// //       //     console.log(asset_0_usd);

// //       //     pool.tvl_usd = Number(tvl_usd.toString());
// //       //   } else {
// //       //     const asset_1_usd = new BN(pool.reserve_1!.toString())
// //       //       .div(10 ** pool.decimals_1!)
// //       //       .mul(usdc_usd!);
// //       //     const tvl_usd = asset_1_usd.mul(2);
// //       //     console.log(asset_1_usd);

// //       //     pool.tvl_usd = Number(tvl_usd.toString());
// //       //   }
// //       // }

// //       // Check if new reserves are negative
// //       // if (newReserve0 < 0n || newReserve1 < 0n) {
// //       //   throw new Error(
// //       //     `reserve0: ${pool.reserve_0} reserve1: ${pool.reserve_1} Insufficient reserves in pool ${poolId}`
// //       //   );
// //       // }
// //       // pool.create_time = pool.create_time ?? ctx.timestamp;

// //       await ctx.store.upsert(pool);
// //     }
// //   );
// // // .onTimeInterval(async (block, ctx) => {
// // //   const pools = await ctx.store.list(Pool)

// // //   pools.forEach((pool, i) => {
// // //     const poolSnapshot = new PoolSnapshot({
// // //       id: pool.id,
// // //       timestamp: Math.floor(new Date(ctx.timestamp).getTime() / 1000),
// // //       block_date: new Date(ctx.timestamp).toISOString().slice(0, 19).replace('T', ' '),
// // //       chain_id: Number(ctx.chainId),
// // //       pool_address: poolIdToStr(pool.id),
// // //       token_index: 0n,
// // //       token_address: pool.lp_token_address,

// // //   });
// // //   })

// // // await ctx.store.upsert(poolSnapshot);
// // // }, 60, 60);
