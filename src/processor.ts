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
import { Balance, LPPosition, Pool, PoolSnapshot } from "./schema/store.js";
import {
  calculateFee,
  getHash,
  getPoolTvl,
  identityToStr,
  poolIdToStr,
  updateBalance,
  updateBalanceByPool,
} from "./utils.js";
import { BN } from "fuels";
import { getPriceBySymbol } from "@sentio/sdk/utils";
import { tokenConfig } from "./tokenConfig.js";

const USDC_ID =
  "0x286c479da40dc953bddc3bb4c453b608bba2e0ac483b077bd475174115395e6b";
let ETH_ID =
  "0xf8f8b6283d7fa5b672b530cbb84fcccb4ff8dc40f8176ef4544ddb1f1952ad07";

DieselAmmContractProcessor.bind({
  address: "0x7c293b054938bedca41354203be4c08aec2c3466412cac803f4ad62abf22e476",
  chainId: FuelNetwork.MAIN_NET,
  startBlock: 11799443n,
})
  .onLogCreatePoolEvent(
    async (
      log: FuelLog<CreatePoolEventOutput>,
      ctx: FuelContractContext<DieselAmmContract>
    ) => {
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

      const pool = new Pool({
        id: poolIdToStr(log.data.pool_id),
        chain_id: 1,
        creation_block_number: 0n,
        timestamp: 0n,
        pool_address: poolIdToStr(log.data.pool_id),
        lp_token_address: "na",
        lp_token_symbol: "na",
        token_address: "na",
        token_symbol: "na",
        token_decimals: "na",
        token_index: "na",
        dex_type: "CPMM",
        token_amount: 0,
        volume_amount: 0,
        total_fees_usd: 0,

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
    }
  )
  .onLogMintEvent(
    async (
      log: FuelLog<MintEventOutput>,
      ctx: FuelContractContext<DieselAmmContract>
    ) => {
      try {
        const asset_0_in = log.data.asset_0_in;
        const asset_1_in = log.data.asset_1_in;
        const asset0Id = log.data.pool_id[0].bits;
        const asset1Id = log.data.pool_id[1].bits;
        const eth_usd = (await getPriceBySymbol("ETH", new Date())) || 3196;
        const usdc_usd = (await getPriceBySymbol("USDC", new Date())) || 1;
        const poolId = poolIdToStr(log.data.pool_id);

        // get pool by id
        const pool = await ctx.store.get(Pool, poolId);

        if (!pool) {
          throw new Error("Pool not found");
        }

        pool.reserve_0 = pool.reserve_0! + BigInt(asset_0_in.toString());
        pool.reserve_1 = pool.reserve_1! + BigInt(asset_1_in.toString());
        pool.lp_token_address = log.data.liquidity.id.bits;
        pool.lp_token_symbol = `${tokenConfig[pool.asset_0!].symbol}-${
          tokenConfig[pool.asset_1!].symbol
        } LP`;

        // pool.tvl_usd = getPoolTvl(pool, eth_usd, usdc_usd);
        // const [address, isContract] = identityToStr(log.data.recipient);

        // const balanceId = getHash(`${address}-${ctx.contractAddress}`);
        // console.log(address);
        // let balance = await ctx.store.get(Balance, balanceId);

        // await updateBalanceByPool(
        //   log.data.recipient.Address?.bits!,
        //   poolId,
        //   asset0Id,
        //   asset1Id,
        //   asset0In,
        //   asset1In,
        //   balance,
        //   balanceId,
        //   ctx
        // );

        const [address, isContract] = identityToStr(log.data.recipient);
        const positionId = getHash(`${address}-${poolIdToStr(pool.id)}`);

        let position = await ctx.store.get(PoolSnapshot, positionId);

        if (!position) {
          const newPosition = new LPPosition({
            id: poolId,
            pool_address: poolIdToStr(pool.id),
            user_address: address,
            token_address: "to be defined",
            token_symbol: "ETH",
            token_amount: 0,
          });
        }

        await ctx.store.upsert(pool);
      } catch (error) {
        console.log("MINT ERROR", error);
      }
    }
  )
  .onLogBurnEvent(
    async (
      log: FuelLog<BurnEventOutput>,
      ctx: FuelContractContext<DieselAmmContract>
    ) => {
      try {
        const asset_0_out = log.data.asset_0_out.toString();
        const asset_1_out = log.data.asset_1_out.toString();
        const asset0Id = log.data.pool_id[0].bits;
        const asset1Id = log.data.pool_id[1].bits;
        const poolId = poolIdToStr(log.data.pool_id);

        const eth_usd = (await getPriceBySymbol("ETH", new Date())) || 3196;
        const usdc_usd = (await getPriceBySymbol("USDC", new Date())) || 1;

        const pool = await ctx.store.get(Pool, poolId);

        if (!pool) {
          throw new Error(`Pool with ID ${poolId} not found`);
        }

        pool.reserve_0 = pool.reserve_0! - BigInt(asset_0_out.toString());
        pool.reserve_1 = pool.reserve_1! - BigInt(asset_1_out.toString());
        pool.lp_token_address = log.data.liquidity.id.bits;
        pool.lp_token_symbol = `${tokenConfig[pool.asset_0!].symbol}-${
          tokenConfig[pool.asset_1!].symbol
        } LP`;

        // pool.tvl_usd = getPoolTvl(pool, eth_usd, usdc_usd);

        // if (
        //   pool.reserve_0 < BigInt(asset0out) ||
        //   pool.reserve_1 < BigInt(asset1out)
        // ) {
        //   throw new Error(
        //     `reserve0: ${pool.reserve_0} reserve1: ${pool.reserve_1} Insufficient reserves in pool ${poolId}`
        //   );
        // }

        // pool.reserve_0 = pool.reserve_0 - BigInt(asset0out);
        // pool.reserve_1 = pool.reserve_1 - BigInt(asset1out);
        // pool.create_time = pool.create_time ?? ctx.timestamp;
        // pool.lpId = log.data.liquidity.id.bits;

        await ctx.store.upsert(pool);
      } catch (error) {
        console.log("BURN EVENT Error", error);
      }
    }
  )
  .onLogSwapEvent(
    async (
      log: FuelLog<SwapEventOutput>,
      ctx: FuelContractContext<DieselAmmContract>
    ) => {
      try {
        const asset_0_in = log.data.asset_0_in.toString();
        const asset_1_in = log.data.asset_1_in.toString();
        const asset_0_out = log.data.asset_0_out.toString();
        const asset_1_out = log.data.asset_1_out.toString();
        const asset0Id = log.data.pool_id[0].bits;
        const asset1Id = log.data.pool_id[1].bits;
        const eth_usd = (await getPriceBySymbol("ETH", new Date())) || 3196;
        const usdc_usd = (await getPriceBySymbol("USDC", new Date())) || 1;
        let vol = 0;
        let fees = 0;

        const poolId = poolIdToStr(log.data.pool_id);

        const pool = await ctx.store.get(Pool, poolId);

        if (!pool) {
          throw new Error(`Pool with ID ${poolId} not found`);
        }

        if (Number(asset_0_in) > 0) {
          vol = Number(
            log.data.asset_0_in.add(log.data.asset_1_out).toString()
          );
          fees =
            Number(calculateFee(pool?.is_stable!, BigInt(asset_0_in))) /
            10 ** pool.decimals_0!;

          if (asset0Id === ETH_ID) {
            fees = fees * eth_usd;
          } else if (asset0Id === USDC_ID) fees = fees * usdc_usd;
        } else if (Number(asset_1_in) > 0) {
          vol = Number(
            log.data.asset_1_in.add(log.data.asset_0_out).toString()
          );
          fees =
            Number(calculateFee(pool?.is_stable!, BigInt(asset_1_in))) /
            10 ** pool.decimals_1!;

          if (asset1Id === ETH_ID) {
            fees = fees * eth_usd;
          } else if (asset1Id === USDC_ID) fees = fees * usdc_usd;
        }

        pool.reserve_0 =
          pool.reserve_0! + BigInt(asset_0_in) - BigInt(asset_0_out);
        pool.reserve_1 =
          pool.reserve_1! + BigInt(asset_1_in) - BigInt(asset_1_out);

        pool.volume_amount = pool.volume_amount + vol;
        pool.total_fees_usd = pool.total_fees_usd! + fees;

        // pool.tvl_usd = getPoolTvl(pool, eth_usd, usdc_usd);

        // Check if new reserves are negative
        // if (newReserve0 < 0n || newReserve1 < 0n) {
        //   throw new Error(
        //     `reserve0: ${pool.reserve_0} reserve1: ${pool.reserve_1} Insufficient reserves in pool ${poolId}`
        //   );
        // }
        // pool.create_time = pool.create_time ?? ctx.timestamp;

        await ctx.store.upsert(pool);
      } catch (error) {
        console.log("SWAP EVENT ERROR", error);
      }
    }
  )
  .onTimeInterval(
    async (block: any, ctx: FuelContractContext<DieselAmmContract>) => {
      try {
        console.log("FROM TIMEREDFFDUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUU");
        const pools = await ctx.store.list(Pool, []);
        console.log("POOLS", pools);

        // pools.forEach(async (pool: Pool, i: any) => {
        //   const poolSnap = await ctx.store.get(PoolSnapshot, pool.id);
        //   if (!poolSnap) {
        //     const poolSnap = new PoolSnapshot({
        //       id: pool.id,
        //       timestamp: Math.floor(new Date(ctx.timestamp).getTime() / 1000),
        //       block_date: new Date(ctx.timestamp)
        //         .toISOString()
        //         .slice(0, 19)
        //         .replace("T", " "),
        //       chain_id: Number(ctx.chainId),
        //       pool_address: poolIdToStr(pool.id),
        //       token_index: 0n,
        //       token_address: "to be defined",
        //       token_symbol: "ETH",
        //       token_amount: 0,
        //       token_amount_usd: 0,
        //       volume_amount: pool.volume_amount,
        //       fee_rate: pool.fee_rate,
        //       total_fees_usd: pool.total_fees_usd,
        //       user_fees_usd: pool.total_fees_usd,
        //       protocol_fees_usd: 0,
        //     });

        //     await ctx.store.upsert(poolSnap);
        //     return;
        //   }
        //   poolSnap.id = pool.id;
        //   poolSnap.timestamp = Math.floor(
        //     new Date(ctx.timestamp).getTime() / 1000
        //   );
        //   poolSnap.block_date = new Date(ctx.timestamp)
        //     .toISOString()
        //     .slice(0, 19)
        //     .replace("T", " ");
        //   poolSnap.chain_id = Number(ctx.chainId);
        //   poolSnap.pool_address = poolIdToStr(pool.id);
        //   poolSnap.token_index = 0n;
        //   poolSnap.token_address = "to be defined";
        //   poolSnap.token_symbol = "ETH";
        //   poolSnap.token_amount = 0;
        //   poolSnap.token_amount_usd = 0;
        //   poolSnap.volume_amount = pool.volume_amount;
        //   poolSnap.fee_rate = pool.fee_rate;
        //   poolSnap.total_fees_usd = pool.total_fees_usd;
        //   poolSnap.user_fees_usd = pool.total_fees_usd;
        //   poolSnap.protocol_fees_usd = 0;

        //   await ctx.store.upsert(poolSnap);
        // });
      } catch (error) {
        console.log("TIME INTERVAL ERROR", error);
      }
    },
    60,
    60
  );
// .onTimeInterval(
//   async (block, ctx) => {
//     console.log("FROM TIMEREDFFDUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUU");
//       const pools = await ctx.store.list(Pool)

// pools.forEach((pool, i) => {
//   const poolSnapshot = new PoolSnapshot({
//     id: pool.id,
//     timestamp: Math.floor(new Date(ctx.timestamp).getTime() / 1000),
//     block_date: new Date(ctx.timestamp).toISOString().slice(0, 19).replace('T', ' '),
//     chain_id: Number(ctx.chainId),
//     pool_address: poolIdToStr(pool.id),
//     token_index: 0n,
//     token_address: pool.lp_token_address,

// })

//   }}),
//   60,
//   60
// );

// import { LogLevel } from "@sentio/sdk";
// import { FuelContractContext, FuelLog, FuelNetwork } from "@sentio/sdk/fuel";

// import { DieselAmmContractProcessor } from "./types/fuel/DieselAmmContractProcessor.js";
// import {
//   BurnEventOutput,
//   CreatePoolEventInput,
//   DieselAmmContract,
//   MintEventOutput,
//   SwapEventOutput,
// } from "./types/fuel/DieselAmmContract.js";
// import { Balance, MainPrice, Pool, PoolSnapshot } from "./schema/store.js";
// import {
//   getHash,
//   getPoolTvl,
//   identityToStr,
//   poolIdToStr,
//   updateBalance,
//   updateBalanceByPool,
// } from "./utils.js";
// import { BN } from "fuels";
// import { getPriceBySymbol } from "@sentio/sdk/utils";
// import axios from "axios";

// const USDC_ID =
//   "0x286c479da40dc953bddc3bb4c453b608bba2e0ac483b077bd475174115395e6b";
// let ETH_ID =
//   "0xf8f8b6283d7fa5b672b530cbb84fcccb4ff8dc40f8176ef4544ddb1f1952ad07";

// DieselAmmContractProcessor.bind({
//   address: "0x7c293b054938bedy41354203be4c08aec2c3466412cac803f4ad62abf22e476",
//   chainId: FuelNetwork.MAIN_NET,
// })
//   .onLogCreatePoolEvent(
//     async (
//       log: FuelLog<CreatePoolEventInput>,
//       ctx: FuelContractContext<DieselAmmContract>
//     ) => {
//       // const pool = new Pool({
//       //   id: poolIdToStr(log.data.pool_id),
//       //   asset_0: log.data.pool_id[0].bits,
//       //   asset_1: log.data.pool_id[1].bits,
//       //   is_stable: log.data.pool_id[2],
//       //   reserve_0: 0n,
//       //   reserve_1: 0n,
//       //   create_time: ctx.timestamp.getTime(),
//       //   decimals_0: Number(log.data.decimals_0),
//       //   decimals_1: Number(log.data.decimals_1),
//       // });
//       // BigInt(ctx.block?.height.toString()!)

//       const pool = new Pool({
//         id: poolIdToStr(log.data.pool_id),
//         chain_id: 1,
//         creation_block_number: 0n,
//         timestamp: 0n,
//         pool_address: poolIdToStr(log.data.pool_id),
//         lp_token_address: "na",
//         lp_token_symbol: "na",
//         token_address: "na",
//         token_symbol: "na",
//         token_decimals: "na",
//         token_index: "na",
//         dex_type: "na",

//         asset_0: log.data.pool_id[0].bits,
//         asset_1: log.data.pool_id[1].bits,
//         is_stable: log.data.pool_id[2],
//         reserve_0: 0n,
//         reserve_1: 0n,
//         decimals_0: Number(log.data.decimals_0),
//         decimals_1: Number(log.data.decimals_1),
//       });
//       console.log("LOG FROM PROCESSOR--------------------");

//       await ctx.store.upsert(pool);
//     }
//   )
//   .onLogMintEvent(
//     async (
//       log: FuelLog<MintEventOutput>,
//       ctx: FuelContractContext<DieselAmmContract>
//     ) => {
//       const asset_0_in = log.data.asset_0_in;
//       const asset_1_in = log.data.asset_1_in;
//       const asset0Id = log.data.pool_id[0].bits;
//       const asset1Id = log.data.pool_id[1].bits;

//       const eth_usd = (await getPriceBySymbol("ETH", new Date())) || 3196;
//       const usdc_usd = (await getPriceBySymbol("USDC", new Date())) || 1;
//       const poolId = poolIdToStr(log.data.pool_id);

//       // get pool by id
//       const pool = await ctx.store.get(Pool, poolId);

//       if (!pool) {
//         throw new Error("Pool not found");
//       }

//       pool.reserve_0 = pool.reserve_0! + BigInt(asset_0_in.toString());
//       pool.reserve_1 = pool.reserve_1! + BigInt(asset_1_in.toString());

//       // if (pool.asset_0 === ETH_ID || pool.asset_1 === ETH_ID) {
//       //   if (pool.asset_0 === ETH_ID) {
//       //     const asset_0_usd = new BN(pool.reserve_0!.toString())
//       //       .div(10 ** pool.decimals_0!)
//       //       .mul(eth_usd!);
//       //     console.log("ASSET OOSDOSDOSDO", asset_0_usd);

//       //     const tvl_usd = asset_0_usd.mul(2);

//       //     pool.tvl_usd = Number(tvl_usd.toString());
//       //   } else {
//       //     const asset_1_usd = new BN(pool.reserve_1!.toString())
//       //       .div(10 ** pool.decimals_1!)
//       //       .mul(eth_usd!);
//       //     const tvl_usd = asset_1_usd.mul(2);
//       //     console.log(asset_1_usd);

//       //     pool.tvl_usd = Number(tvl_usd.toString());
//       //   }
//       // } else if (pool.asset_0 === USDC_ID || pool.asset_1 === USDC_ID) {
//       //   if (pool.asset_0 === USDC_ID) {
//       //     const asset_0_usd = new BN(pool.reserve_0!.toString())
//       //       .div(10 ** pool.decimals_0!)
//       //       .mul(usdc_usd!);
//       //     const tvl_usd = asset_0_usd.mul(2);
//       //     console.log(asset_0_usd);

//       //     pool.tvl_usd = Number(tvl_usd.toString());
//       //   } else {
//       //     const asset_1_usd = new BN(pool.reserve_1!.toString())
//       //       .div(10 ** pool.decimals_1!)
//       //       .mul(usdc_usd!);
//       //     const tvl_usd = asset_1_usd.mul(2);
//       //     console.log(asset_1_usd);

//       //     pool.tvl_usd = Number(tvl_usd.toString());
//       //   }
//       // }

//       const lp_token_address = log.data.liquidity.id.bits;
//       // const lp_token_symbol =
//       // const [address, isContract] = identityToStr(log.data.recipient);

//       // const balanceId = getHash(`${address}-${ctx.contractAddress}`);
//       // console.log(address);
//       // let balance = await ctx.store.get(Balance, balanceId);

//       // await updateBalanceByPool(
//       //   log.data.recipient.Address?.bits!,
//       //   poolId,
//       //   asset0Id,
//       //   asset1Id,
//       //   asset0In,
//       //   asset1In,
//       //   balance,
//       //   balanceId,
//       //   ctx
//       // );

//       await ctx.store.upsert(pool);
//     }
//   )
//   .onLogBurnEvent(
//     async (
//       log: FuelLog<BurnEventOutput>,
//       ctx: FuelContractContext<DieselAmmContract>
//     ) => {
//       const eth_usd = (await getPriceBySymbol("ETH", new Date())) || 3196;
//       const usdc_usd = (await getPriceBySymbol("USDC", new Date())) || 1;

//       const asset_0_out = log.data.asset_0_out.toString();
//       const asset_1_out = log.data.asset_1_out.toString();
//       const asset0Id = log.data.pool_id[0].bits;
//       const asset1Id = log.data.pool_id[1].bits;
//       const poolId = poolIdToStr(log.data.pool_id);

//       const pool = await ctx.store.get(Pool, poolId);

//       if (!pool) {
//         throw new Error(`Pool with ID ${poolId} not found`);
//       }

//       pool.reserve_0 = pool.reserve_0! - BigInt(asset_0_out.toString());
//       pool.reserve_1 = pool.reserve_1! - BigInt(asset_1_out.toString());

//       // if (pool.asset_0 === ETH_ID || pool.asset_1 === ETH_ID) {
//       //   if (pool.asset_0 === ETH_ID) {
//       //     const asset_0_usd = new BN(pool.reserve_0!.toString())
//       //       .div(10 ** pool.decimals_0!)
//       //       .mul(eth_usd!);
//       //     console.log("ASSET OOSDOSDOSDO", asset_0_usd);

//       //     const tvl_usd = asset_0_usd.mul(2);

//       //     pool.tvl_usd = Number(tvl_usd.toString());
//       //   } else {
//       //     const asset_1_usd = new BN(pool.reserve_1!.toString())
//       //       .div(10 ** pool.decimals_1!)
//       //       .mul(eth_usd!);
//       //     const tvl_usd = asset_1_usd.mul(2);
//       //     console.log(asset_1_usd);

//       //     pool.tvl_usd = Number(tvl_usd.toString());
//       //   }
//       // } else if (pool.asset_0 === USDC_ID || pool.asset_1 === USDC_ID) {
//       //   if (pool.asset_0 === USDC_ID) {
//       //     const asset_0_usd = new BN(pool.reserve_0!.toString())
//       //       .div(10 ** pool.decimals_0!)
//       //       .mul(usdc_usd!);
//       //     const tvl_usd = asset_0_usd.mul(2);
//       //     console.log(asset_0_usd);

//       //     pool.tvl_usd = Number(tvl_usd.toString());
//       //   } else {
//       //     const asset_1_usd = new BN(pool.reserve_1!.toString())
//       //       .div(10 ** pool.decimals_1!)
//       //       .mul(usdc_usd!);
//       //     const tvl_usd = asset_1_usd.mul(2);
//       //     console.log(asset_1_usd);

//       //     pool.tvl_usd = Number(tvl_usd.toString());
//       //   }
//       // }

//       // if (
//       //   pool.reserve_0 < BigInt(asset0out) ||
//       //   pool.reserve_1 < BigInt(asset1out)
//       // ) {
//       //   throw new Error(
//       //     `reserve0: ${pool.reserve_0} reserve1: ${pool.reserve_1} Insufficient reserves in pool ${poolId}`
//       //   );
//       // }

//       // pool.reserve_0 = pool.reserve_0 - BigInt(asset0out);
//       // pool.reserve_1 = pool.reserve_1 - BigInt(asset1out);
//       // pool.create_time = pool.create_time ?? ctx.timestamp;
//       // pool.lpId = log.data.liquidity.id.bits;

//       await ctx.store.upsert(pool);
//     }
//   )
//   .onLogSwapEvent(
//     async (
//       log: FuelLog<SwapEventOutput>,
//       ctx: FuelContractContext<DieselAmmContract>
//     ) => {
//       const eth_usd = (await getPriceBySymbol("ETH", new Date())) || 3196;
//       const usdc_usd = (await getPriceBySymbol("USDC", new Date())) || 1;

//       const asset_0_in = log.data.asset_0_in.toString();
//       const asset_1_in = log.data.asset_1_in.toString();
//       const asset_0_out = log.data.asset_0_out.toString();
//       const asset_1_out = log.data.asset_1_out.toString();
//       const asset0Id = log.data.pool_id[0].bits;
//       const asset1Id = log.data.pool_id[1].bits;
//       const poolId = poolIdToStr(log.data.pool_id);

//       const pool = await ctx.store.get(Pool, poolId);

//       if (!pool) {
//         throw new Error(`Pool with ID ${poolId} not found`);
//       }

//       pool.reserve_0 =
//         pool.reserve_0! + BigInt(asset_0_in) - BigInt(asset_0_out);
//       pool.reserve_1 =
//         pool.reserve_1! + BigInt(asset_1_in) - BigInt(asset_1_out);

//       // if (pool.asset_0 === ETH_ID || pool.asset_1 === ETH_ID) {
//       //   if (pool.asset_0 === ETH_ID) {
//       //     const asset_0_usd = new BN(pool.reserve_0!.toString())
//       //       .div(10 ** pool.decimals_0!)
//       //       .mul(eth_usd!);
//       //     console.log("ASSET OOSDOSDOSDO", asset_0_usd);

//       //     const tvl_usd = asset_0_usd.mul(2);

//       //     pool.tvl_usd = Number(tvl_usd.toString());
//       //   } else {
//       //     const asset_1_usd = new BN(pool.reserve_1!.toString())
//       //       .div(10 ** pool.decimals_1!)
//       //       .mul(eth_usd!);
//       //     const tvl_usd = asset_1_usd.mul(2);
//       //     console.log(asset_1_usd);

//       //     pool.tvl_usd = Number(tvl_usd.toString());
//       //   }
//       // } else if (pool.asset_0 === USDC_ID || pool.asset_1 === USDC_ID) {
//       //   if (pool.asset_0 === USDC_ID) {
//       //     const asset_0_usd = new BN(pool.reserve_0!.toString())
//       //       .div(10 ** pool.decimals_0!)
//       //       .mul(usdc_usd!);
//       //     const tvl_usd = asset_0_usd.mul(2);
//       //     console.log(asset_0_usd);

//       //     pool.tvl_usd = Number(tvl_usd.toString());
//       //   } else {
//       //     const asset_1_usd = new BN(pool.reserve_1!.toString())
//       //       .div(10 ** pool.decimals_1!)
//       //       .mul(usdc_usd!);
//       //     const tvl_usd = asset_1_usd.mul(2);
//       //     console.log(asset_1_usd);

//       //     pool.tvl_usd = Number(tvl_usd.toString());
//       //   }
//       // }

//       // Check if new reserves are negative
//       // if (newReserve0 < 0n || newReserve1 < 0n) {
//       //   throw new Error(
//       //     `reserve0: ${pool.reserve_0} reserve1: ${pool.reserve_1} Insufficient reserves in pool ${poolId}`
//       //   );
//       // }
//       // pool.create_time = pool.create_time ?? ctx.timestamp;

//       await ctx.store.upsert(pool);
//     }
//   );
// // .onTimeInterval(async (block, ctx) => {
// //   const pools = await ctx.store.list(Pool)

// //   pools.forEach((pool, i) => {
// //     const poolSnapshot = new PoolSnapshot({
// //       id: pool.id,
// //       timestamp: Math.floor(new Date(ctx.timestamp).getTime() / 1000),
// //       block_date: new Date(ctx.timestamp).toISOString().slice(0, 19).replace('T', ' '),
// //       chain_id: Number(ctx.chainId),
// //       pool_address: poolIdToStr(pool.id),
// //       token_index: 0n,
// //       token_address: pool.lp_token_address,

// //   });
// //   })

// // await ctx.store.upsert(poolSnapshot);
// // }, 60, 60);
