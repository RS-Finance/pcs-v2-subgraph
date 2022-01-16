/* eslint-disable prefer-const */
import { BigDecimal, Address } from "@graphprotocol/graph-ts/index";
import { Pair, Token, Bundle } from "../generated/schema";
import { ZERO_BD, factoryContract, ADDRESS_ZERO, ONE_BD } from "./utils";

let WKCS_ADDRESS = "0x4446fc4eb47f2f6586f9faab68b3498f86c07521";
let BUSD_WKCS_PAIR = "0x26d94a2e3bd703847c3be3c30ead42b926b427c2"; // created block 589414
let USDT_WKCS_PAIR = "0x1116b80fd0ff9a980dcfbfa3ed477bfa6bbd6a85"; // created block 648115

export function getKcsPriceInUSD(): BigDecimal {
  // fetch eth prices for each stablecoin
  let usdtPair = Pair.load(USDT_WKCS_PAIR); // usdt is token0
  let busdPair = Pair.load(BUSD_WKCS_PAIR); // busd is token1

  if (busdPair !== null && usdtPair !== null) {
    let totalLiquidityKCS = busdPair.reserve0.plus(usdtPair.reserve1);
    if (totalLiquidityKCS.notEqual(ZERO_BD)) {
      let busdWeight = busdPair.reserve0.div(totalLiquidityKCS);
      let usdtWeight = usdtPair.reserve1.div(totalLiquidityKCS);
      return busdPair.token1Price.times(busdWeight).plus(usdtPair.token0Price.times(usdtWeight));
    } else {
      return ZERO_BD;
    }
  } else if (busdPair !== null) {
    return busdPair.token1Price;
  } else if (usdtPair !== null) {
    return usdtPair.token0Price;
  } else {
    return ZERO_BD;
  }
}

// token where amounts should contribute to tracked volume and liquidity
let WHITELIST: string[] = [
  '0x4446fc4eb47f2f6586f9faab68b3498f86c07521', // WKCS
  '0x0039f574ee5cc39bdd162e9a88e3eb1f111baf48',  // USDT
  '0xe3f5a90f9cb311505cd691a46596599aa1a0ad7d',  // BUSD
  '0x980a5afef3d17ad98635f6c5aebcbaeded3c3430', // USDC
  '0x755d74d009f656ca1652cbdc135e3b6abfccc455',  // KSF
  '0x1bbd57143428452a4deb42519391a0a436481c8e',  // RS
  '0xc9baa8cfdde8e328787e29b4b078abf2dadc2055',  // DAI 
  '0xfa93c12cd345c658bc4644d1d4e1b9615952258c',  // BTCK
  '0x639a647fbe20b6c8ac19e48e2de44ea792c62c5c',  // BNB
];

// minimum liquidity for price to get tracked
let MINIMUM_LIQUIDITY_THRESHOLD_KCS = BigDecimal.fromString("10");

/**
 * Search through graph to find derived KCS per token.
 * @todo update to be derived KCS (add stablecoin estimates)
 **/
export function findKcsPerToken(token: Token): BigDecimal {
  if (token.id == WKCS_ADDRESS) {
    return ONE_BD;
  }
  // loop through whitelist and check if paired with any
  for (let i = 0; i < WHITELIST.length; ++i) {
    let pairAddress = factoryContract.getPair(Address.fromString(token.id), Address.fromString(WHITELIST[i]));
    if (pairAddress.toHex() != ADDRESS_ZERO) {
      let pair = Pair.load(pairAddress.toHex());
      if (pair.token0 == token.id && pair.reserveKCS.gt(MINIMUM_LIQUIDITY_THRESHOLD_KCS)) {
        let token1 = Token.load(pair.token1);
        return pair.token1Price.times(token1.derivedKCS as BigDecimal); // return token1 per our token * KCS per token 1
      }
      if (pair.token1 == token.id && pair.reserveKCS.gt(MINIMUM_LIQUIDITY_THRESHOLD_KCS)) {
        let token0 = Token.load(pair.token0);
        return pair.token0Price.times(token0.derivedKCS as BigDecimal); // return token0 per our token * KCS per token 0
      }
    }
  }
  return ZERO_BD; // nothing was found return 0
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD.
 * If both are, return average of two amounts
 * If neither is, return 0
 */
export function getTrackedVolumeUSD(
  bundle: Bundle,
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token
): BigDecimal {
  let price0 = token0.derivedKCS.times(bundle.kcsPrice);
  let price1 = token1.derivedKCS.times(bundle.kcsPrice);

  // both are whitelist tokens, take average of both amounts
  if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).plus(tokenAmount1.times(price1)).div(BigDecimal.fromString("2"));
  }

  // take full value of the whitelisted token amount
  if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0);
  }

  // take full value of the whitelisted token amount
  if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount1.times(price1);
  }

  // neither token is on white list, tracked volume is 0
  return ZERO_BD;
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD * 2.
 * If both are, return sum of two amounts
 * If neither is, return 0
 */
export function getTrackedLiquidityUSD(
  bundle: Bundle,
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token
): BigDecimal {
  let price0 = token0.derivedKCS.times(bundle.kcsPrice);
  let price1 = token1.derivedKCS.times(bundle.kcsPrice);

  // both are whitelist tokens, take average of both amounts
  if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).plus(tokenAmount1.times(price1));
  }

  // take double value of the whitelisted token amount
  if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).times(BigDecimal.fromString("2"));
  }

  // take double value of the whitelisted token amount
  if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount1.times(price1).times(BigDecimal.fromString("2"));
  }

  // neither token is on white list, tracked volume is 0
  return ZERO_BD;
}
