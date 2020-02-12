import {
  FETCH_CIRCULATING_NEC_DATA,
  FETCH_BURNED_NEC,
  FETCH_DEVERSIFI_NEC_ETH_DATA,
  FETCH_NEXT_AUCTION_ETH_DATA,
  FETCH_CURRENT_AUCTION_SUMMARY,
  FETCH_AUCTION_INTERVAL_DATA,
  SELL_IN_AUCTION_START,
  FETCH_AUCTION_TRANSACTIONS,
  FETCH_ETH_PRICE,
  SELL_AND_BURN_NEC
} from './actionTypes';
import Web3 from 'web3';
import config from '../constants/config.json';
import eth from '../services/ethereumService';
import { formatEth, formatNumber } from '../services/utils';
import { notify, notifyError } from './notificationActions';
import { openLogin } from './accountActions';

const web3 = new Web3();
web3.setProvider(new web3.providers.HttpProvider(config.providerUrl));

export async function getBurnedNEC() {
  // const account = await eth.getAccount();
  const engineContract = eth.getEngineContract();
  const blockRange = await eth.getChartBlockRange();
  const burnedNec = [];
  let pastEvents = await engineContract.getPastEvents('AuctionClose', blockRange);

  let burnedSum = 0
  pastEvents.map((event, index) => {
    burnedSum = burnedSum + event.returnValues.necBurned / 10 ** 18
    burnedNec.push({
      name: `Point ${index}`,
      pv: burnedSum,
      amt: event.event,
    });
  });
  return burnedNec;
}

export const fetchBurnedNec = () => async dispatch => {
  const burnedNecData = await Promise.all(await getBurnedNEC());

  dispatch({ type: FETCH_BURNED_NEC, burnedNecData });
};

export async function getCirculatingNEC() {
  const tokenContract = eth.getTokenContract();
  const blockRange = await eth.getChartBlockRange();
  const blockDiff = Math.floor((blockRange.toBlock - blockRange.fromBlock) / 7);
  const circulatingNec = [];
  //This should be totalSupplyAt()
  for (let block = blockRange.fromBlock; block <= blockRange.toBlock; block += blockDiff) {
    tokenContract.methods.totalSupply().call(null, block, (error, totalSupply) => {
      circulatingNec.push({
        name: `Point ${block}`,
        pv: Math.floor(totalSupply / 10 ** 18),
      });
    });
  }

  return circulatingNec;
}

export async function getDeversifiNecEth() {
  // const account = await eth.getAccount();
  const engineContract = eth.getEngineContract();
  const blockRange = await eth.getChartBlockRange();
  const deversifiNecEth = [];
  let pastEvents = await engineContract.getPastEvents('Burn', blockRange);

  pastEvents.map((event, index) => {
    deversifiNecEth.push({
      name: `Point ${index}`,
      pv: Math.floor(event.returnValues.price / 10 ** 18),
    });
  });
  return deversifiNecEth;
}

export const fetchCirculatingNec = () => async dispatch => {
  const circulatingNecData = await getCirculatingNEC();

  dispatch({ type: FETCH_CIRCULATING_NEC_DATA, circulatingNecData });
};

export const fetchDeversifiNecEth = () => async dispatch => {
  const deversifiNecEthData = await getDeversifiNecEth();
  dispatch({ type: FETCH_DEVERSIFI_NEC_ETH_DATA, deversifiNecEthData });
};

const fetchedCurrentActionSummary = data => async dispatch => {
  const engineContract = eth.getEngineContract();

  try {
    const current = await engineContract.methods.getCurrentAuction().call();
    const blockRange = await eth.getChartBlockRange();
    const transactions = await engineContract.getPastEvents('Burn', blockRange);

    let purchasedNec = 0
    let sumEth = 0
    let necAveragePrice = 'N/A'
    console.log(transactions.length)
    if(transactions.length) {
      transactions.forEach(transaction => {
        purchasedNec = purchasedNec + transaction.returnValues.amount
        sumEth = sumEth + +transaction.returnValues.amount / +transaction.returnValues.price
      })
      purchasedNec = purchasedNec / 1000000000000000000
      necAveragePrice = sumEth / purchasedNec
    }
    const currentNecPrice = (1000000000000000000/current.currentPrice).toFixed(5)


    dispatch({
      type: FETCH_CURRENT_AUCTION_SUMMARY,
      nextPriceChange: current.nextPriceChangeSeconds - Date.now() / 1000,
      startTimeSeconds: Number(current.startTimeSeconds),
      currentAuctionSummary: {
        currentNecPrice: currentNecPrice,
        nextNecPrice: (1000000000000000000/current.nextPrice).toFixed(5),
        remainingEth: current.remainingEthAvailable,
        initialEth: current.initialEthAvailable,
        necAveragePrice: necAveragePrice,
        purchasedNec: purchasedNec
      }
    });
  } catch(e) {
    console.log(e)
    dispatch({
      type: FETCH_CURRENT_AUCTION_SUMMARY,
      currentAuctionSummary: null
    });
  }
};

export const fetchCurrentActionSummary = data => async dispatch => {
  dispatch(fetchedCurrentActionSummary());
};

export const fetchAuctionIntervalData = () => async dispatch => {
  const engineContract = await eth.getEngineContract();
  const necPrice = await eth.getNecPrice();
  const blockRange = await eth.getChartBlockRange();
  const transactions = await engineContract.getPastEvents('Burn', blockRange);

  const data = transactions.map(transaction => ({
    nec: transaction.returnValues.amount,
    eth: formatEth(transaction.returnValues.price)
  }));

  dispatch({ type: FETCH_AUCTION_INTERVAL_DATA, auctionIntervalData: data });
};

const sellInAuctionEnd = data => ({
  type: SELL_IN_AUCTION_START,
  sellInAuctionData: [],
});

export const sellInAuctionStart = data => async dispatch => {
  dispatch(sellInAuctionEnd());
};


export const fetchAuctionTransactions = data => async dispatch => {
  const engineContract = await eth.getEngineContract();
  const necPrice = await eth.getNecPrice();
  const blockRange = await eth.getChartBlockRange();
  const transactions = await engineContract.getPastEvents('Burn', blockRange);

  const transactionsList = transactions.map(transaction => ({
    blockNumber: transaction.blockNumber,
    wallet_address: transaction.returnValues.burner,
    nec: formatEth(transaction.returnValues.amount),
    eth: (formatEth(transaction.returnValues.amount) / transaction.returnValues.price).toFixed(5),
    price_nec_eth: ( 1 / transaction.returnValues.price).toFixed(5),
    price_nec_usd: necPrice,
    usd: (formatEth(transaction.returnValues.amount) * necPrice).toFixed(2),
  }));

  dispatch({ type: FETCH_AUCTION_TRANSACTIONS, auctionTransactions: transactionsList });
};

export const fetchEthPrice = () => async dispatch => {
  const necPrice = await eth.getNecPrice();

  dispatch({ type: FETCH_ETH_PRICE, necPrice })
}

export const sellAndBurn = (necAmount) => async (dispatch, getState) => {
  if (!getState().account.accountType) return dispatch(openLogin())

  const userTokenBalance = getState().account.tokenBalance

  if (necAmount < 1) {
    return notifyError('This is below the minimum you can sell')(dispatch)
  }

  if (!userTokenBalance || userTokenBalance < 0.1) {
    return notifyError('You first need nectar tokens in your wallet')(dispatch)
  }

  if (userTokenBalance < necAmount) {
    return notifyError(`You only have: ${userTokenBalance} NEC in your wallet`)(dispatch)
  }

  try {
    await eth.sellAndBurn(necAmount, getState().account.accountType)
    notify('You have sold NEC!', 'success')(dispatch)
    dispatch({ type: SELL_AND_BURN_NEC })
  } catch(err) {
    notifyError(err)(dispatch)
  }
}
