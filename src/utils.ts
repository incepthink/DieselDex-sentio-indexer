import crypto from "crypto";
import { Balance, LPPosition, Pool } from "./schema/store.js";
import { getPriceBySymbol } from "@sentio/sdk/utils";
import { BN } from "fuels";

const USDC_ID =
  "0x286c479da40dc953bddc3bb4c453b608bba2e0ac483b077bd475174115395e6b";
const ETH_ID =
  "0xf8f8b6283d7fa5b672b530cbb84fcccb4ff8dc40f8176ef4544ddb1f1952ad07";
const FUEL_ID =
  "0x1d5d97005e41cae2187a895fd8eab0506111e0e2f3331cd3912c15c24e3c1d82";

export function poolIdToStr(poolId: any): string {
  return `${poolId[0].bits}_${poolId[1].bits}_${poolId[2]}`;
}

export function identityToStr(identity: any): any {
  switch (identity.Address) {
    case "Address":
      return [identity.Address.bits, false];
    case "ContractId":
      return [identity.Address.bits, true];
  }
}

export const getHash = (data: string) => {
  return crypto.createHash("sha256").update(data).digest("hex");
};

export const updateBalanceByPool = async (
  address: string,
  poolId: string,
  asset0Id: string,
  asset1Id: string,
  asset0In: BN,
  asset1In: BN,
  balance: Balance | undefined,
  balanceId: string,
  ctx: any
) => {
  const ethPrice = (await getPriceBySymbol("ETH", ctx.timestamp)) || 3200;
  const usdcPrice = (await getPriceBySymbol("USDC", ctx.timestamp)) || 0.99;

  if (asset0Id === ETH_ID || asset1Id === ETH_ID) {
    console.log(poolId, ethPrice, usdcPrice);

    if (asset0Id === ETH_ID) {
      const asset0InUsd = (Number(asset0In) / 10 ** 9) * ethPrice;
      const tvlUsd = asset0InUsd * 2;

      await updateBalance(balance, balanceId, address, poolId, tvlUsd, ctx);
    } else {
      const asset1InUsd = (Number(asset1In) / 10 ** 9) * ethPrice;
      const tvlUsd = asset1InUsd * 2;

      await updateBalance(balance, balanceId, address, poolId, tvlUsd, ctx);
    }
  } else if (asset0Id === USDC_ID || asset1Id === USDC_ID) {
    console.log(poolId, ethPrice, usdcPrice);
    if (asset0Id === USDC_ID) {
      const asset0InUsd = (Number(asset0In) / 10 ** 9) * usdcPrice;
      const tvlUsd = asset0InUsd * 2;

      await updateBalance(balance, balanceId, address, poolId, tvlUsd, ctx);
    } else {
      const asset1InUsd = (Number(asset1In) / 10 ** 9) * usdcPrice;
      const tvlUsd = asset1InUsd * 2;

      await updateBalance(balance, balanceId, address, poolId, tvlUsd, ctx);
    }
  }
};

export const updateBalance = async (
  balance: Balance | undefined,
  balanceId: string,
  address: string,
  pool_id: string,
  tvl: number,
  ctx: any
): Promise<void> => {
  if (balance) {
    balance.tvl += tvl;
  } else {
    balance = new Balance({
      id: balanceId,
      user: address,
      pool_address: pool_id,
      tvl,
    });
  }

  await ctx.store.upsert(balance);
};

const ammFees = {
  lpFeeVolatile: BigInt(30),
  lpFeeStable: BigInt(5),
  protocolFeeStable: BigInt(0),
  protocolFeeVolatile: BigInt(0),
};

function roundingUpDivision(nominator: bigint, denominator: bigint): bigint {
  let roundingDownDivisionResult = nominator / denominator;
  if (nominator % denominator === BigInt(0)) {
    return roundingDownDivisionResult;
  } else {
    return roundingDownDivisionResult + BigInt(1);
  }
}

const BASIS_POINTS = BigInt(10000);

export const calculateFee = (is_stable: boolean, amount: bigint): bigint => {
  const feeBP = is_stable
    ? ammFees.lpFeeStable + ammFees.protocolFeeStable
    : ammFees.lpFeeVolatile + ammFees.protocolFeeVolatile;
  const nominator = amount * feeBP;
  // return roundingUpDivision(nominator, BASIS_POINTS);
  return nominator;
};

export const getPoolTvl = (pool: Pool, eth_usd: number, usdc_usd: number) => {
  if (pool.asset_0 === ETH_ID || pool.asset_1 === ETH_ID) {
    if (pool.asset_0 === ETH_ID) {
      const asset_0_usd =
        (Number(pool.reserve_0) / 10 ** pool.decimals_0!) * eth_usd;

      const tvl_usd = asset_0_usd * 2;

      return tvl_usd;
    } else {
      const asset_1_usd =
        (Number(pool.reserve_0) / 10 ** pool.decimals_1!) * eth_usd;
      const tvl_usd = asset_1_usd * 2;

      return tvl_usd;
    }
  } else if (pool.asset_0 === USDC_ID || pool.asset_1 === USDC_ID) {
    if (pool.asset_0 === USDC_ID) {
      const asset_0_usd =
        (Number(pool.reserve_0) / 10 ** pool.decimals_0!) * usdc_usd;
      const tvl_usd = asset_0_usd * 2;

      return tvl_usd;
    } else {
      const asset_1_usd =
        (Number(pool.reserve_0) / 10 ** pool.decimals_1!) * eth_usd;
      const tvl_usd = asset_1_usd * 2;

      return tvl_usd;
    }
  }
  return 0;
};

export function formatTimestamp(date: Date) {
  // YYYY-MM-DD format (daily snapshot)
  const dailySnapshot = date.toISOString().split("T")[0];

  // YYYY-MM-DD HH:00:00 format (hourly snapshot)
  const hourlySnapshot = `${dailySnapshot} ${String(
    date.getUTCHours()
  ).padStart(2, "0")}:00:00`;

  return { dailySnapshot, hourlySnapshot };
}

export function updatePoolTokenAmountUsd(
  pool0: Pool,
  pool1: Pool,
  eth_usd: number,
  usdc_usd: number,
  fuel_usd: number
) {
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

  return { pool0, pool1 };
}

export async function updatePositionAmount(
  pool0: Pool,
  pool1: Pool,
  position: LPPosition,
  ratio: number,
  ctx: any
) {
  if (position.token_index === 0) {
    position.token_amount_usd = ratio * pool0.token_amount_usd!;
    position.ratio = ratio;
    await ctx.store.upsert(position);
  } else {
    position.ratio = ratio;
    position.token_amount_usd = ratio * pool1.token_amount_usd!;
    await ctx.store.upsert(position);
  }
}

export function getTokenAmountUsd(
  pool: Pool,
  token_amount: number,
  eth_usd: number,
  usdc_usd: number,
  fuel_usd: number
) {
  if (pool.token_address === ETH_ID) {
    return token_amount * eth_usd;
  } else if (pool.token_address === USDC_ID) {
    return token_amount * usdc_usd;
  } else if (pool.token_address === FUEL_ID) {
    return token_amount * fuel_usd;
  } else {
    return null;
  }
}
