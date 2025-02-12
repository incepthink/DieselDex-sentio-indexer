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
  Diesel_TotalSupplyEvent,
  LiquidityTransactionEvent,
  LPPosition,
  LPPositionSnapshot,
  Pool,
  PoolSnapshot,
  Trades,
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
  getTokenAmountUsd,
  identityToStr,
  poolIdToStr,
  updateBalance,
  updateBalanceByPool,
  updatePoolTokenAmountUsd,
  updatePositionAmount,
} from "./utils.js";
import { BN } from "fuels";
import { getPriceBySymbol, token } from "@sentio/sdk/utils";
import { tokenConfig } from "./tokenConfig.js";

const USDC_ID =
  "0x286c479da40dc953bddc3bb4c453b608bba2e0ac483b077bd475174115395e6b";
const ETH_ID =
  "0xf8f8b6283d7fa5b672b530cbb84fcccb4ff8dc40f8176ef4544ddb1f1952ad07";
const FUEL_ID =
  "0x1d5d97005e41cae2187a895fd8eab0506111e0e2f3331cd3912c15c24e3c1d82";

DieselAmmContractProcessor.bind({
  address: "0x7c293b054938bedca41354203be4c08aec2c3466412cac803f4ad62abf22e476",
  chainId: FuelNetwork.MAIN_NET,
  startBlock: 9000000n,
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
    } else if (asset_0_id === FUEL_ID || asset_1_id === FUEL_ID) {
      symbol = "FUEL";
      decimals = 9;
      address = FUEL_ID;
      if (asset_0_id === FUEL_ID) {
        index = 0;
      } else {
        index = 1;
      }
    } else {
      // Skip pools which dont have eth or usdc
      return;
    }

    const pool0 = new Pool({
      id: poolIdToStr(log.data.pool_id),
      chain_id: 9889,
      creation_block_number: Number(ctx.transaction?.blockNumber) || 0,
      timestamp: Math.floor(new Date(ctx.timestamp).getTime() / 1000),
      pool_address: poolIdToStr(log.data.pool_id),
      lp_token_address: "na",
      lp_token_symbol: "na",
      token_address: log.data.pool_id[0].bits,
      token_symbol: tokenConfig[log.data.pool_id[0].bits].symbol,
      token_decimals: tokenConfig[log.data.pool_id[0].bits].decimal,
      token_index: 0,
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
      fee_rate: log.data.pool_id[2] ? 0.0005 : 0.003,
      tvl: 0n,
    });

    const pool1 = new Pool({
      id: getHash(poolIdToStr(log.data.pool_id)),
      chain_id: 9889,
      creation_block_number: Number(ctx.transaction?.blockNumber) || 0,
      timestamp: Math.floor(new Date(ctx.timestamp).getTime() / 1000),
      pool_address: poolIdToStr(log.data.pool_id),
      lp_token_address: "na",
      lp_token_symbol: "na",
      token_address: log.data.pool_id[1].bits,
      token_symbol: tokenConfig[log.data.pool_id[1].bits].symbol,
      token_decimals: tokenConfig[log.data.pool_id[1].bits].decimal,
      token_index: 1,
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
      fee_rate: log.data.pool_id[2] ? 0.0005 : 0.003,
      tvl: 0n,
    });

    pool0.tvl_usd = pool0.token_amount_usd! * 2;
    pool1.tvl_usd = pool1.token_amount_usd! * 2;

    await ctx.store.upsert(pool0);
    await ctx.store.upsert(pool1);
  })
  .onLogMintEvent(async (log, ctx) => {
    try {
      const asset_0_in = BigInt(log.data.asset_0_in.toString());
      const asset_1_in = BigInt(log.data.asset_1_in.toString());

      const address = log.data.recipient.Address?.bits || "0x";

      const asset_0_id = log.data.pool_id[0].bits;
      const asset_1_id = log.data.pool_id[1].bits;

      const poolId = poolIdToStr(log.data.pool_id);

      const eth_usd = (await getPriceBySymbol("ETH", new Date())) || 3196;
      const usdc_usd = (await getPriceBySymbol("USDC", new Date())) || 1;
      const fuel_usd = (await getPriceBySymbol("FUEL", new Date())) || 0.017;

      const pool0 = await ctx.store.get(Pool, poolId);
      const pool1 = await ctx.store.get(Pool, getHash(poolId));

      if (!pool0 || !pool1) {
        throw new Error("Pool not found");
      }

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
          chain_id: 9889,
          block_number: Number(ctx.transaction?.blockNumber) || 0,
          log_index: log.receiptIndex,
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
          chain_id: 9889,
          block_number: Number(ctx.transaction?.blockNumber) || 0,
          log_index: log.receiptIndex,
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

      // set the lp id
      pool0.pool_address = log.data.liquidity.id.bits;
      pool1.pool_address = log.data.liquidity.id.bits;

      // update the reserves
      pool0.reserve_0 = BigInt(
        log.data.asset_0_in.add(pool0.reserve_0.toString()).toString()
      );
      pool0.reserve_1 = BigInt(
        log.data.asset_1_in.add(pool0.reserve_1.toString()).toString()
      );
      pool1.reserve_0 = BigInt(
        log.data.asset_0_in.add(pool1.reserve_0.toString()).toString()
      );
      pool1.reserve_1 = BigInt(
        log.data.asset_1_in.add(pool1.reserve_1.toString()).toString()
      );

      // update token metadata
      pool0.lp_token_address = log.data.liquidity.id.bits;
      pool0.lp_token_symbol = `${tokenConfig[pool0.asset_0!].symbol}-${
        tokenConfig[pool0.asset_1!].symbol
      } LP`;
      pool1.lp_token_address = log.data.liquidity.id.bits;
      pool1.lp_token_symbol = `${tokenConfig[pool1.asset_0!].symbol}-${
        tokenConfig[pool1.asset_1!].symbol
      } LP`;

      // update token amount
      pool1.token_amount = Number(pool1.reserve_1) / 10 ** pool0.decimals_1!;
      pool0.token_amount = Number(pool0.reserve_0) / 10 ** pool0.decimals_0!;

      // set token amount usd
      if (pool0.token_address === ETH_ID || pool1.token_address === ETH_ID) {
        if (pool1.token_address === ETH_ID) {
          pool1.token_amount_usd = pool1.token_amount * eth_usd;

          pool0.token_amount_usd = pool1.token_amount_usd;
        } else {
          pool0.token_amount_usd = pool0.token_amount * eth_usd;

          pool1.token_amount_usd = pool0.token_amount_usd;
        }
      } else if (
        pool0.token_address === USDC_ID ||
        pool1.token_address === USDC_ID
      ) {
        if (pool1.token_address === USDC_ID) {
          pool1.token_amount_usd = pool1.token_amount * usdc_usd;

          pool0.token_amount_usd = pool1.token_amount_usd;
        } else {
          pool0.token_amount_usd = pool0.token_amount * usdc_usd;

          pool1.token_amount_usd = pool0.token_amount_usd;
        }
      } else if (
        pool0.token_address === FUEL_ID ||
        pool1.token_address === FUEL_ID
      ) {
        if (pool1.token_address === FUEL_ID) {
          pool1.token_amount_usd = pool1.token_amount * fuel_usd;

          pool0.token_amount_usd = pool1.token_amount_usd;
        } else {
          pool0.token_amount_usd = pool0.token_amount * fuel_usd;

          pool1.token_amount_usd = pool0.token_amount_usd;
        }
      }

      pool0.tvl_usd = pool0.token_amount_usd! * 2;
      pool0.tvl = pool0.reserve_0 + pool0.reserve_1;
      await ctx.store.upsert(pool0);

      pool1.tvl_usd = pool1.token_amount_usd! * 2;
      pool1.tvl = pool1.reserve_0 + pool1.reserve_1;
      await ctx.store.upsert(pool1);

      // UPDATE LP POSITION

      const positionId0 = getHash(
        `${address}-${poolIdToStr(log.data.pool_id)}`
      );
      const positionId1 = getHash(
        `${address}-${getHash(poolIdToStr(log.data.pool_id))}`
      );

      let position0 = await ctx.store.get(LPPosition, positionId0);
      let position1 = await ctx.store.get(LPPosition, positionId1);

      // store the mint amount
      let token_amount0 = Number(asset_0_in) / 10 ** pool0.decimals_0!;
      let token_amount1 = Number(asset_1_in) / 10 ** pool1.decimals_1!;

      console.log("pool0 symbol", pool0.token_symbol);
      console.log("pool1 symbol", pool1.token_symbol);

      const liquidity = await ctx.store.get(
        Diesel_TotalSupplyEvent,
        log.data.liquidity.id.bits
      );

      // store the position of token 0
      if (!position0) {
        // const ratio = token_amount0 / Number(pool0.token_amount);

        const ratio =
          Number(log.data.liquidity.amount.toString()) /
          Number(liquidity!.supply);

        let token_amount_usd = Number(ratio * pool0.token_amount_usd!);

        const newPosition0 = new LPPosition({
          id: positionId0,
          pool_address: log.data.liquidity.id.bits,
          user_address: address,
          token_index: pool0.token_index,
          token_address: pool0.token_address,
          token_symbol: pool0.token_symbol,
          token_amount: token_amount0,
          token_amount_usd: token_amount_usd,
          ratio: ratio,
          pool_token_amount: pool0.token_amount_usd,
          liquidity_token_amount: Number(log.data.liquidity.amount.toString()),
        });

        await ctx.store.upsert(newPosition0);
      } else {
        position0.token_amount! = position0.token_amount! + token_amount0;
        position0.liquidity_token_amount! += Number(
          log.data.liquidity.amount.toString()
        );

        // const ratio =
        //   Number(position0.token_amount!.toString()) /
        //   Number(pool0.token_amount);

        const ratio =
          position0.liquidity_token_amount! / Number(liquidity!.supply);

        let token_amount_usd = Number(ratio * pool0.token_amount_usd!);

        position0.token_amount_usd! = token_amount_usd;

        position0.tvl_usd! = token_amount_usd;
        position0.token_amount_usd = token_amount_usd;
        position0.ratio = ratio;
        position0.pool_token_amount = pool0.token_amount_usd;

        await ctx.store.upsert(position0);
      }

      if (!position1) {
        // const ratio = token_amount1 / Number(pool1.token_amount);
        const ratio =
          Number(log.data.liquidity.amount.toString()) /
          Number(liquidity!.supply);

        let token_amount_usd = Number(ratio * pool0.token_amount_usd!);

        const newPosition1 = new LPPosition({
          id: positionId1,
          pool_address: log.data.liquidity.id.bits,
          user_address: address,
          token_index: pool1.token_index,
          token_address: pool1.token_address,
          token_symbol: pool1.token_symbol,
          token_amount: token_amount1,
          token_amount_usd: token_amount_usd,
          ratio: ratio,
          pool_token_amount: pool1.token_amount_usd,
          liquidity_token_amount: Number(log.data.liquidity.amount.toString()),
        });

        await ctx.store.upsert(newPosition1);
      } else {
        position1.token_amount! = position1.token_amount! + token_amount1;
        position1.liquidity_token_amount! += Number(
          log.data.liquidity.amount.toString()
        );

        // const ratio =
        //   Number(position1.token_amount!.toString()) /
        //   Number(pool1.token_amount);

        const ratio =
          position1.liquidity_token_amount! / Number(liquidity!.supply);

        let token_amount_usd = Number(ratio * pool0.token_amount_usd!);

        position1.token_amount_usd! = token_amount_usd;

        position1.tvl_usd! = token_amount_usd;
        position1.token_amount_usd = token_amount_usd;
        position1.ratio = ratio;
        position1.pool_token_amount = pool1.token_amount;

        await ctx.store.upsert(position1);
      }

      // update all lp positions
      const positions = ctx.store.listIterator(LPPosition, [
        { field: "pool_address", op: "=", value: log.data.liquidity.id.bits },
      ]);

      for await (const position of positions) {
        const ratio =
          Number(position!.token_amount!.toString()) /
          Number(liquidity!.supply);
        await updatePositionAmount(pool0, pool1, position, ratio, ctx);
      }

      // STORE LIQUIDITY TRANSACTION EVENT
      const eventData = {
        token_address: "",
        token_index: 0,
        token_amount: 0,
        token_amount_usd: 0,
      };

      if (asset_0_id === ETH_ID || asset_1_id === ETH_ID) {
        eventData.token_address = ETH_ID;
        if (asset_0_id === ETH_ID) {
          eventData.token_index = 0;
          eventData.token_amount = Number(asset_0_in) / 10 ** pool0.decimals_0!;
          eventData.token_amount_usd =
            (Number(asset_0_in) / 10 ** pool0.decimals_0!) * eth_usd;
        } else {
          eventData.token_index = 1;
          eventData.token_amount = Number(asset_1_in) / 10 ** pool0.decimals_1!;
          eventData.token_amount_usd =
            (Number(asset_1_in) / 10 ** pool0.decimals_1!) * eth_usd;
        }
      } else if (asset_0_id === USDC_ID || asset_1_id === USDC_ID) {
        eventData.token_address = USDC_ID;
        if (asset_0_id === USDC_ID) {
          eventData.token_index = 0;
          eventData.token_amount = Number(asset_0_in) / 10 ** pool0.decimals_0!;
          eventData.token_amount_usd =
            (Number(asset_0_in) / 10 ** pool0.decimals_0!) * usdc_usd;
        } else {
          eventData.token_index = 1;
          eventData.token_amount = Number(asset_1_in) / 10 ** pool0.decimals_1!;
          eventData.token_amount_usd =
            (Number(asset_1_in) / 10 ** pool0.decimals_1!) * usdc_usd;
        }
      } else {
        return;
      }

      const liqTransId = getHash(
        `${ctx.transaction?.id}_${address}_${Math.floor(
          new Date(ctx.timestamp).getTime() / 1000
        )}`
      );

      const newLiqTransaction = new LiquidityTransactionEvent({
        id: liqTransId,
        timestamp: Math.floor(new Date(ctx.timestamp).getTime() / 1000),
        chain_id: 9889,
        block_number: Number(ctx.transaction?.blockNumber),
        log_index: log.receiptIndex,
        transaction_hash: ctx.transaction?.id,
        user_address: address,
        taker_address: log.data.recipient.Address?.bits,
        pool_address: poolId,
        token_address: eventData.token_address,
        token_index: eventData.token_index,
        token_amount: eventData.token_amount,
        token_amount_usd: eventData.token_amount_usd,
        event_type: "deposit",
      });

      await ctx.store.upsert(newLiqTransaction);

      log.data.liquidity.amount;
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

      const asset_0_id = log.data.pool_id[0].bits;
      const asset_1_id = log.data.pool_id[1].bits;

      const eth_usd = (await getPriceBySymbol("ETH", new Date())) || 3196;
      const usdc_usd = (await getPriceBySymbol("USDC", new Date())) || 1;
      const fuel_usd = (await getPriceBySymbol("FUEL", new Date())) || 0.017;

      const pool0 = await ctx.store.get(Pool, poolId);
      const pool1 = await ctx.store.get(Pool, getHash(poolId));

      if (!pool0 || !pool1) {
        throw new Error("Pool not found");
      }

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
          chain_id: 9889,
          block_number: Number(ctx.transaction?.blockNumber) || 0,
          log_index: log.receiptIndex,
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
          chain_id: 9889,
          block_number: Number(ctx.transaction?.blockNumber) || 0,
          log_index: log.receiptIndex,
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

      // upadte pool reserves
      pool0.reserve_0 = BigInt(
        new BN(pool0.reserve_0.toString()).sub(log.data.asset_0_out).toString()
      );
      pool0.reserve_1 = BigInt(
        new BN(pool0.reserve_1.toString()).sub(log.data.asset_1_out).toString()
      );
      pool1.reserve_0 = BigInt(
        new BN(pool1.reserve_0.toString()).sub(log.data.asset_0_out).toString()
      );
      pool1.reserve_1 = BigInt(
        new BN(pool1.reserve_1.toString()).sub(log.data.asset_1_out).toString()
      );

      // update lp token address
      pool0.lp_token_address = log.data.liquidity.id.bits;
      pool0.lp_token_symbol = `${tokenConfig[pool0.asset_0!].symbol}-${
        tokenConfig[pool0.asset_1!].symbol
      } LP`;

      pool1.lp_token_address = log.data.liquidity.id.bits;
      pool1.lp_token_symbol = `${tokenConfig[pool1.asset_0!].symbol}-${
        tokenConfig[pool1.asset_1!].symbol
      } LP`;

      // update token amount
      pool1.token_amount = Number(pool1.reserve_1) / 10 ** pool1.decimals_1!;
      pool0.token_amount = Number(pool0.reserve_0) / 10 ** pool0.decimals_0!;

      // set token amount usd
      if (pool0.token_address === ETH_ID || pool1.token_address === ETH_ID) {
        if (pool1.token_address === ETH_ID) {
          pool1.token_amount_usd = pool1.token_amount * eth_usd;

          pool0.token_amount_usd = pool1.token_amount_usd;
        } else {
          pool0.token_amount_usd = pool0.token_amount * eth_usd;

          pool1.token_amount_usd = pool0.token_amount_usd;
        }
      } else if (
        pool0.token_address === USDC_ID ||
        pool1.token_address === USDC_ID
      ) {
        if (pool1.token_address === USDC_ID) {
          pool1.token_amount_usd = pool1.token_amount * usdc_usd;

          pool0.token_amount_usd = pool1.token_amount_usd;
        } else {
          pool0.token_amount_usd = pool0.token_amount * usdc_usd;

          pool1.token_amount_usd = pool0.token_amount_usd;
        }
      } else if (
        pool0.token_address === FUEL_ID ||
        pool1.token_address === FUEL_ID
      ) {
        if (pool1.token_address === FUEL_ID) {
          pool1.token_amount_usd = pool1.token_amount * fuel_usd;

          pool0.token_amount_usd = pool1.token_amount_usd;
        } else {
          pool0.token_amount_usd = pool0.token_amount * fuel_usd;

          pool1.token_amount_usd = pool0.token_amount_usd;
        }
      }

      pool0.tvl_usd = pool0.token_amount_usd! * 2;
      pool0.tvl = pool0.reserve_0 + pool0.reserve_1;
      await ctx.store.upsert(pool0);

      pool1.tvl_usd = pool1.token_amount_usd! * 2;
      pool1.tvl = pool1.reserve_0 + pool1.reserve_1;
      await ctx.store.upsert(pool1);

      // UPDATE LP POSITION

      const positionId0 = getHash(
        `${address}-${poolIdToStr(log.data.pool_id)}`
      );
      const positionId1 = getHash(
        `${address}-${getHash(poolIdToStr(log.data.pool_id))}`
      );

      let position0 = await ctx.store.get(LPPosition, positionId0);
      let position1 = await ctx.store.get(LPPosition, positionId1);

      let token_amount0 = Number(asset_0_out) / 10 ** pool0.decimals_0!;
      let token_amount1 = Number(asset_1_out) / 10 ** pool1.decimals_1!;

      const liquidity = await ctx.store.get(
        Diesel_TotalSupplyEvent,
        log.data.liquidity.id.bits
      );

      // const ratio =
      //   Number(log.data.liquidity.amount.toString()) /
      //   Number(liquidity!.supply);

      if (!position0) {
        // const ratio = token_amount0 / Number(pool0.token_amount);

        const ratio =
          Number(log.data.liquidity.amount.toString()) /
          Number(liquidity!.supply);

        let token_amount_usd = Number(ratio * pool0.token_amount_usd!);

        const newPosition0 = new LPPosition({
          id: positionId0,
          pool_address: log.data.liquidity.id.bits,
          user_address: address,
          token_index: pool0.token_index,
          token_address: pool0.token_address,
          token_symbol: pool0.token_symbol,
          token_amount: token_amount0,
          token_amount_usd: token_amount_usd,
          ratio: ratio,
          pool_token_amount: pool0.token_amount_usd,
          liquidity_token_amount: Number(log.data.liquidity.amount.toString()),
        });

        await ctx.store.upsert(newPosition0);
      } else {
        position0.token_amount! = position0.token_amount! - token_amount0;
        position0.liquidity_token_amount! -= Number(
          log.data.liquidity.amount.toString()
        );

        const ratio =
          position0.liquidity_token_amount! / Number(liquidity!.supply);

        // const ratio =
        //   Number(position0.token_amount!) / Number(pool0.token_amount);

        let token_amount_usd = Number(ratio * pool0.token_amount_usd!);

        position0.token_amount_usd! = token_amount_usd;

        position0.tvl_usd! = token_amount_usd;
        position0.token_amount_usd = token_amount_usd;
        position0.ratio = ratio;
        position0.pool_token_amount = pool0.token_amount_usd;

        await ctx.store.upsert(position0);
      }

      if (!position1) {
        // const ratio = token_amount1 / Number(pool1.token_amount);
        const ratio =
          Number(log.data.liquidity.amount.toString()) /
          Number(liquidity!.supply);

        let token_amount_usd = Number(ratio * pool0.token_amount_usd!);

        const newPosition1 = new LPPosition({
          id: positionId1,
          pool_address: log.data.liquidity.id.bits,
          user_address: address,
          token_index: pool1.token_index,
          token_address: pool1.token_address,
          token_symbol: pool1.token_symbol,
          token_amount: token_amount1,
          token_amount_usd: token_amount_usd,
          ratio: ratio,
          pool_token_amount: pool1.token_amount_usd,
          liquidity_token_amount: Number(log.data.liquidity.amount.toString()),
        });

        await ctx.store.upsert(newPosition1);
      } else {
        position1.token_amount! = position1.token_amount! - token_amount1;
        position1.liquidity_token_amount! -= Number(
          log.data.liquidity.amount.toString()
        );

        const ratio =
          position1.liquidity_token_amount! / Number(liquidity!.supply);

        // const ratio =
        //   Number(position1.token_amount!) / Number(pool1.token_amount);

        let token_amount_usd = Number(ratio * pool0.token_amount_usd!);

        position1.token_amount_usd! = token_amount_usd;

        position1.tvl_usd! = token_amount_usd;
        position1.token_amount_usd = token_amount_usd;
        position1.ratio = ratio;
        position1.pool_token_amount = pool1.token_amount;

        await ctx.store.upsert(position1);
      }

      // update all lp positions
      const positions = ctx.store.listIterator(LPPosition, [
        { field: "pool_address", op: "=", value: log.data.liquidity.id.bits },
      ]);

      for await (const position of positions) {
        const ratio =
          Number(position!.token_amount!.toString()) /
          Number(liquidity!.supply);
        await updatePositionAmount(pool0, pool1, position, ratio, ctx);
      }

      // STORE LIQUIDITY TRANSACTION EVENT
      const eventData = {
        token_address: "",
        token_index: 0,
        token_amount: 0,
        token_amount_usd: 0,
      };

      if (asset_0_id === ETH_ID || asset_1_id === ETH_ID) {
        eventData.token_address = ETH_ID;
        if (asset_0_id === ETH_ID) {
          eventData.token_index = 0;
          eventData.token_amount =
            Number(asset_0_out) / 10 ** pool0.decimals_0!;
          eventData.token_amount_usd =
            (Number(asset_0_out) / 10 ** pool0.decimals_0!) * eth_usd;
        } else {
          eventData.token_index = 1;
          eventData.token_amount =
            Number(asset_1_out) / 10 ** pool0.decimals_1!;
          eventData.token_amount_usd =
            (Number(asset_1_out) / 10 ** pool0.decimals_1!) * eth_usd;
        }
      } else if (asset_0_id === USDC_ID || asset_1_id === USDC_ID) {
        eventData.token_address = USDC_ID;
        if (asset_0_id === USDC_ID) {
          eventData.token_index = 0;
          eventData.token_amount =
            Number(asset_0_out) / 10 ** pool0.decimals_0!;
          eventData.token_amount_usd =
            (Number(asset_0_out) / 10 ** pool0.decimals_0!) * usdc_usd;
        } else {
          eventData.token_index = 1;
          eventData.token_amount =
            Number(asset_1_out) / 10 ** pool0.decimals_1!;
          eventData.token_amount_usd =
            (Number(asset_1_out) / 10 ** pool0.decimals_1!) * usdc_usd;
        }
      } else {
        return;
      }

      const liqTransId = getHash(
        `${ctx.transaction?.id}_${address}_${Math.floor(
          new Date(ctx.timestamp).getTime() / 1000
        )}`
      );

      const newLiqTransaction = new LiquidityTransactionEvent({
        id: liqTransId,
        timestamp: Math.floor(new Date(ctx.timestamp).getTime() / 1000),
        chain_id: 9889,
        block_number: Number(ctx.transaction?.blockNumber),
        log_index: log.receiptIndex,
        transaction_hash: ctx.transaction?.id,
        user_address: address,
        taker_address: log.data.recipient.Address?.bits,
        pool_address: poolId,
        token_address: eventData.token_address,
        token_index: eventData.token_index,
        token_amount: eventData.token_amount,
        token_amount_usd: eventData.token_amount_usd,
        event_type: "withdrawal",
      });

      await ctx.store.upsert(newLiqTransaction);
    } catch (error) {
      console.log("BURN EVENT Error", error);
    }
  })
  .onLogSwapEvent(async (log, ctx) => {
    try {
      const asset_0_in = BigInt(log.data.asset_0_in.toString());
      const asset_1_in = BigInt(log.data.asset_1_in.toString());
      const asset_0_out = BigInt(log.data.asset_0_out.toString());
      const asset_1_out = BigInt(log.data.asset_1_out.toString());
      const asset0Id = log.data.pool_id[0].bits;
      const asset1Id = log.data.pool_id[1].bits;
      const eth_usd = (await getPriceBySymbol("ETH", new Date())) || 3196;
      const usdc_usd = (await getPriceBySymbol("USDC", new Date())) || 1;
      const fuel_usd = (await getPriceBySymbol("FUEL", new Date())) || 0.017;
      let vol = 0;
      let fees = 0;

      const poolId = poolIdToStr(log.data.pool_id);

      // UPDATE POOL DATA
      const is_buy = Number(log.data.asset_1_in) > 0;
      const is_sell = Number(log.data.asset_1_out) > 0;

      const pool0 = await ctx.store.get(Pool, poolId);
      const pool1 = await ctx.store.get(Pool, getHash(poolId));

      if (!pool0 || !pool1) {
        throw new Error("Pool not found");
      }

      pool0.reserve_0 = pool0.reserve_0 + (asset_0_in - asset_0_out);
      pool0.reserve_1 = pool0.reserve_1 + (asset_1_in - asset_1_out);

      pool1.reserve_0 = pool1.reserve_0 + (asset_0_in - asset_0_out);
      pool1.reserve_1 = pool1.reserve_1 + (asset_1_in - asset_1_out);

      let exchange_rate = BigInt(0);
      try {
        if (is_buy) {
          exchange_rate =
            (BigInt(asset_0_in) * BigInt(10n ** 18n)) / BigInt(asset_0_out);
        } else {
          exchange_rate =
            (BigInt(asset_1_out) * BigInt(10n ** 18n)) / BigInt(asset_0_in);
        }
      } catch (err) {
        console.log("ERROR EXC RATE", err);
      }

      pool0.exchange_rate = exchange_rate;
      pool1.exchange_rate = exchange_rate;

      // update token amount
      pool1.token_amount = Number(pool1.reserve_1) / 10 ** pool1.decimals_1!;
      pool0.token_amount = Number(pool0.reserve_0) / 10 ** pool0.decimals_0!;

      // set token amount usd
      if (pool0.token_address === ETH_ID || pool1.token_address === ETH_ID) {
        if (pool1.token_address === ETH_ID) {
          pool1.token_amount_usd = pool1.token_amount * eth_usd;

          pool0.token_amount_usd = pool1.token_amount_usd;
        } else {
          pool0.token_amount_usd = pool0.token_amount * eth_usd;

          pool1.token_amount_usd = pool0.token_amount_usd;
        }
      } else if (
        pool0.token_address === USDC_ID ||
        pool1.token_address === USDC_ID
      ) {
        if (pool1.token_address === USDC_ID) {
          pool1.token_amount_usd = pool1.token_amount * usdc_usd;

          pool0.token_amount_usd = pool1.token_amount_usd;
        } else {
          pool0.token_amount_usd = pool0.token_amount * usdc_usd;

          pool1.token_amount_usd = pool0.token_amount_usd;
        }
      } else if (
        pool0.token_address === FUEL_ID ||
        pool1.token_address === FUEL_ID
      ) {
        if (pool1.token_address === FUEL_ID) {
          pool1.token_amount_usd = pool1.token_amount * fuel_usd;

          pool0.token_amount_usd = pool1.token_amount_usd;
        } else {
          pool0.token_amount_usd = pool0.token_amount * fuel_usd;

          pool1.token_amount_usd = pool0.token_amount_usd;
        }
      }

      // calculate fees and volume
      let vol_usd = 0;
      let swap_amount_usd = 0;

      if (Number(asset_0_in) > 0) {
        vol = Number(asset_0_in) / 1e18 + Number(asset_1_out) / 1e18;

        fees =
          Number(calculateFee(pool0?.is_stable!, BigInt(asset_0_in))) / 1e18;

        swap_amount_usd =
          Number(asset_0_in) / 1e18 + Number(asset_1_out) / 1e18;

        if (asset0Id === ETH_ID) {
          fees = fees * eth_usd;
          swap_amount_usd = swap_amount_usd * eth_usd;
        } else if (asset0Id === USDC_ID) {
          fees = fees * usdc_usd;
          swap_amount_usd = swap_amount_usd * usdc_usd;
        }
      } else if (Number(asset_1_in) > 0) {
        vol = Number(asset_1_in) / 1e18 + Number(asset_0_out) / 1e18;

        fees =
          Number(calculateFee(pool0?.is_stable!, BigInt(asset_1_in))) / 1e18;

        swap_amount_usd =
          Number(asset_1_in) / 1e18 + Number(asset_0_out) / 1e18;

        if (asset1Id === ETH_ID) {
          fees = fees * eth_usd;
          swap_amount_usd = swap_amount_usd * eth_usd;
        } else if (asset1Id === USDC_ID) {
          fees = fees * usdc_usd;
          swap_amount_usd = swap_amount_usd * usdc_usd;
        }
      }

      if (pool0.asset_0 === ETH_ID || pool0.asset_1 === ETH_ID) {
        vol_usd = vol * eth_usd;
      } else if (pool0.asset_0 === USDC_ID || pool0.asset_1 === USDC_ID) {
        vol_usd = vol * usdc_usd;
      }

      pool0.total_fees_usd! += fees;
      pool0.volume_amount += vol;
      pool0.volume_usd! += vol_usd;

      pool0.tvl_usd = pool0.token_amount_usd! * 2;
      pool0.tvl = pool0.reserve_0 + pool0.reserve_1;

      if (Number(asset_0_in) > 0) {
        vol = Number(asset_0_in) / 1e18 + Number(asset_1_out) / 1e18;

        fees =
          Number(calculateFee(pool1?.is_stable!, BigInt(asset_0_in))) / 1e18;

        swap_amount_usd =
          Number(asset_0_in) / 1e18 + Number(asset_1_out) / 1e18;

        if (asset0Id === ETH_ID) {
          fees = fees * eth_usd;
          swap_amount_usd = swap_amount_usd * eth_usd;
        } else if (asset0Id === USDC_ID) {
          fees = fees * usdc_usd;
          swap_amount_usd = swap_amount_usd * usdc_usd;
        }
      } else if (Number(asset_1_in) > 0) {
        vol = Number(asset_1_in) / 1e18 + Number(asset_0_out) / 1e18;

        fees =
          Number(calculateFee(pool1?.is_stable!, BigInt(asset_1_in))) / 1e18;

        swap_amount_usd =
          Number(asset_1_in) / 1e18 + Number(asset_0_out) / 1e18;

        if (asset1Id === ETH_ID) {
          fees = fees * eth_usd;
          swap_amount_usd = swap_amount_usd * eth_usd;
        } else if (asset1Id === USDC_ID) {
          fees = fees * usdc_usd;
          swap_amount_usd = swap_amount_usd * usdc_usd;
        }
      }

      if (pool1.asset_0 === ETH_ID || pool1.asset_1 === ETH_ID) {
        vol_usd = vol * eth_usd;
      } else if (pool1.asset_0 === USDC_ID || pool1.asset_1 === USDC_ID) {
        vol_usd = vol * usdc_usd;
      }

      pool1.total_fees_usd! += fees;
      pool1.volume_amount += vol;
      pool1.volume_usd! += vol_usd;

      pool1.tvl_usd = pool1.token_amount_usd! * 2;
      pool1.tvl = pool1.reserve_0 + pool1.reserve_1;
      await ctx.store.upsert(pool0);
      await ctx.store.upsert(pool1);

      // update all lp positions
      const positions = ctx.store.listIterator(LPPosition, [
        { field: "pool_address", op: "=", value: pool0.lp_token_address },
      ]);

      const liquidity = await ctx.store.get(
        Diesel_TotalSupplyEvent,
        pool0.lp_token_address
      );

      for await (const position of positions) {
        const ratio =
          position.liquidity_token_amount! / Number(liquidity!.supply);
        await updatePositionAmount(pool0, pool1, position, ratio, ctx);
      }

      // STORE TRADES DATA
      const tradeId = getHash(
        `${Number(ctx.transaction?.blockNumber)}_${ctx.transaction?.id}`
      );
      const tradeData = {
        input_token_address: "",
        input_token_symbol: "",
        input_token_amount: 0,
        output_token_address: "",
        output_token_symbol: "",
        output_token_amount: 0,
        spot_price_after_swap: 0,
        swap_amount_usd: 0,
        fees_usd: fees,
      };

      if (asset_0_in > 0) {
        tradeData.input_token_address = asset0Id;
        tradeData.input_token_symbol = tokenConfig[asset0Id].symbol;
        tradeData.input_token_amount =
          Number(asset_0_in) / 10 ** pool0.decimals_0!;
        tradeData.output_token_address = asset1Id;
        tradeData.output_token_symbol = tokenConfig[asset1Id].symbol;
        tradeData.output_token_amount =
          Number(asset_1_out) / 10 ** pool0.decimals_1!;
        tradeData.spot_price_after_swap =
          Number(pool0.reserve_0) / Number(pool0.reserve_1);
      } else if (asset_1_in > 0) {
        tradeData.input_token_address = asset1Id;
        tradeData.input_token_symbol = tokenConfig[asset1Id].symbol;
        tradeData.input_token_amount =
          Number(asset_1_in) / 10 ** pool0.decimals_1!;
        tradeData.output_token_address = asset0Id;
        tradeData.output_token_symbol = tokenConfig[asset0Id].symbol;
        tradeData.output_token_amount =
          Number(asset_0_out) / 10 ** pool0.decimals_0!;
        tradeData.spot_price_after_swap =
          Number(pool0.reserve_1) / Number(pool0.reserve_0);
      }

      console.log(log.data.recipient.Address?.bits);
      if (log.data.recipient.Address?.bits) {
        const newTrade = new Trades({
          id: tradeId,
          timestamp: Math.floor(new Date(ctx.timestamp).getTime() / 1000),
          chain_id: 9889,
          block_number: Number(ctx.transaction?.blockNumber),
          log_index: log.receiptIndex,
          transaction_hash: ctx.transaction?.id,
          user_address: log.data.recipient.Address?.bits,
          taker_address: log.data.recipient.Address?.bits,
          maker_address: poolId,
          pair_name: poolIdToStr(log.data.pool_id),
          pool_address: poolIdToStr(log.data.pool_id),
          input_token_address: tradeData.input_token_address,
          input_token_symbol: tradeData.input_token_symbol,
          input_token_amount: tradeData.input_token_amount,
          output_token_address: tradeData.output_token_address,
          output_token_symbol: tradeData.output_token_symbol,
          output_token_amount: tradeData.output_token_amount,
          spot_price_after_swap: tradeData.spot_price_after_swap,
          swap_amount_usd: swap_amount_usd,
          fees_usd: tradeData.fees_usd,
          sqrt_price_x96: "",
        });

        await ctx.store.upsert(newTrade);
      }
    } catch (error) {
      console.log("SWAP EVENT ERROR", error);
    }
  })
  .onTransfer({}, async (log, ctx) => {
    // STORE V2 TRANSFERS
    const transferId = getHash(
      `${log.assetId}-${Math.floor(new Date(ctx.timestamp).getTime() / 1000)}`
    );

    const v2Transfer = new V2Transfers({
      id: transferId,
      timestamp: Math.floor(new Date(ctx.timestamp).getTime() / 1000),
      chain_id: 9889,
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
  })
  .onLogTotalSupplyEvent(async (log, ctx) => {
    const supply = await ctx.store.get(
      Diesel_TotalSupplyEvent,
      log.data.asset.bits
    );

    if (supply) {
      supply.supply = BigInt(log.data.supply.toString());
      await ctx.store.upsert(supply);
    } else {
      const totalSupply = new Diesel_TotalSupplyEvent({
        id: log.data.asset.bits,
        time: Math.floor(new Date(ctx.timestamp).getTime() / 1000),
        block_height: Number(ctx.transaction?.blockNumber),
        transaction_id: ctx.transaction?.id!,
        asset: log.data.asset.bits,
        supply: BigInt(log.data.supply.toString()),
        sender: log.data.sender.Address?.bits!,
      });
      await ctx.store.upsert(totalSupply);
    }
  })
  .onTimeInterval(
    async (block, ctx) => {
      const pools = ctx.store.listIterator(Pool, []);

      const { dailySnapshot, hourlySnapshot } = formatTimestamp(ctx.timestamp);
      for await (const pool of pools) {
        const dailySnapshotId = getHash(
          `${pool.pool_address}_${Math.floor(
            new Date(ctx.timestamp).getTime()
          )}_${pool.token_index}`
        );

        const newPoolSnapDaily = new PoolSnapshot({
          id: dailySnapshotId,
          chain_id: 9889,
          timestamp: Math.floor(new Date(ctx.timestamp).getTime() / 1000),
          pool_address: pool.pool_address,
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

        await ctx.store.upsert(newPoolSnapDaily);
      }

      const LPPositions = ctx.store.listIterator(LPPosition, []);

      const userPoolTVLMap = new Map<string, number>();

      for await (const position of LPPositions) {
        const dailySnapshotIdLP = getHash(
          `${position.user_address}_${position.pool_address}_${Math.floor(
            new Date(ctx.timestamp).getTime()
          )}_${position.token_index}`
        );

        const newPositionSnapDaily = new LPPositionSnapshot({
          id: dailySnapshotIdLP,
          chain_id: 9889,
          timestamp: Math.floor(new Date(ctx.timestamp).getTime() / 1000),
          pool_address: position.pool_address,
          user_address: position.user_address,
          block_date: dailySnapshot,
          token_index: position.token_index,
          token_address: position.token_address,
          token_symbol: position.token_symbol,
          token_amount: Number(position.token_amount),
          token_amount_usd: position.token_amount_usd,
        });

        await ctx.store.upsert(newPositionSnapDaily);

        // Track cumulative TVL per user per pool
        const userPoolKey = `${position.user_address}_${position.pool_address}`;
        const currentTVL = userPoolTVLMap.get(userPoolKey) || 0;
        userPoolTVLMap.set(
          userPoolKey,
          currentTVL + (position.token_amount_usd || 0)
        );
      }
      // Create user score snapshots after aggregating all positions
      for (const [userPoolKey, totalTVL] of userPoolTVLMap.entries()) {
        const [userAddress, poolAddress] = userPoolKey.split("_");

        const dailySnapshotIdUser = getHash(
          `${userAddress}_${Math.floor(
            new Date(ctx.timestamp).getTime()
          )}_${poolAddress}`
        );

        const newUserSnapDaily = new UserScoreSnapshot({
          id: dailySnapshotIdUser,
          chain_id: 9889,
          timestamp: Math.floor(new Date(ctx.timestamp).getTime() / 1000),
          pool_address: poolAddress,
          user_address: userAddress,
          block_date: dailySnapshot,
          block_number: Number(ctx.transaction?.blockNumber),
          total_value_locked_score: totalTVL,
        });

        await ctx.store.upsert(newUserSnapDaily);
      }
    },
    1440,
    1440
  );
