import "server-only";

import { getKisEnv } from "./env";
import { kisGet, toNumber } from "./request";

/**
 * 잔고조회 (읽기 전용).
 * 주문 관련 TR은 이 파일에도, 다른 어디에도 두지 않는다 (CLAUDE.md §2-1).
 */

const TR_DOMESTIC_BALANCE = "TTTC8434R";
const TR_OVERSEAS_BALANCE = "TTTS3012R";

export type DomesticPosition = {
  symbol: string;
  name: string;
  qty: number;
  avgPrice: number;
  price: number;
};

export type OverseasPosition = DomesticPosition & { currency: string };

export type BalanceResult = {
  domestic: DomesticPosition[];
  overseas: OverseasPosition[];
  /** 예수금총금액 (원). */
  cashKrw: number;
};

/** 국내주식 잔고. 실전계좌는 1회 50건이라 연속조회로 이어붙인다. */
async function fetchDomestic() {
  const { cano, acntPrdtCd } = getKisEnv();
  const positions: DomesticPosition[] = [];
  let cashKrw = 0;
  let fk = "";
  let nk = "";
  let trCont = "";

  for (let page = 0; page < 10; page += 1) {
    const { body, nextTrCont } = await kisGet(
      "/uapi/domestic-stock/v1/trading/inquire-balance",
      TR_DOMESTIC_BALANCE,
      {
        CANO: cano,
        ACNT_PRDT_CD: acntPrdtCd,
        AFHR_FLPR_YN: "N",
        OFL_YN: "",
        INQR_DVSN: "02", // 종목별
        UNPR_DVSN: "01",
        FUND_STTL_ICLD_YN: "N",
        FNCG_AMT_AUTO_RDPT_YN: "N",
        PRCS_DVSN: "00", // 전일매매 포함
        CTX_AREA_FK100: fk,
        CTX_AREA_NK100: nk,
      },
      trCont,
    );

    for (const row of body.output1 ?? []) {
      const qty = toNumber(row.hldg_qty);
      // 당일 전량매도분은 수량 0으로 남는다. 보유로 취급하지 않는다.
      if (qty <= 0) continue;
      positions.push({
        symbol: row.pdno ?? "",
        name: (row.prdt_name ?? "").trim(),
        qty,
        avgPrice: toNumber(row.pchs_avg_pric),
        price: toNumber(row.prpr),
      });
    }

    const summary = Array.isArray(body.output2) ? body.output2[0] : body.output2;
    if (summary) cashKrw = toNumber(summary.dnca_tot_amt);

    const record = body as unknown as Record<string, string>;
    fk = record.ctx_area_fk100?.trim() ?? "";
    nk = record.ctx_area_nk100?.trim() ?? "";
    trCont = nextTrCont;
    if (!trCont || !nk) break;
  }

  return { positions, cashKrw };
}

/**
 * 해외주식 잔고. 실전계좌에서 NASD는 미국 전체를 뜻한다.
 * 미국 외 시장(홍콩·일본 등)을 보유하게 되면 거래소 코드를 여기에 추가한다.
 */
async function fetchOverseas() {
  const { cano, acntPrdtCd } = getKisEnv();
  const positions: OverseasPosition[] = [];
  let fk = "";
  let nk = "";
  let trCont = "";

  for (let page = 0; page < 10; page += 1) {
    const { body, nextTrCont } = await kisGet(
      "/uapi/overseas-stock/v1/trading/inquire-balance",
      TR_OVERSEAS_BALANCE,
      {
        CANO: cano,
        ACNT_PRDT_CD: acntPrdtCd,
        OVRS_EXCG_CD: "NASD",
        TR_CRCY_CD: "USD",
        CTX_AREA_FK200: fk,
        CTX_AREA_NK200: nk,
      },
      trCont,
    );

    for (const row of body.output1 ?? []) {
      const qty = toNumber(row.ovrs_cblc_qty);
      if (qty <= 0) continue;
      positions.push({
        symbol: (row.ovrs_pdno ?? "").trim(),
        name: (row.ovrs_item_name ?? "").trim(),
        qty,
        avgPrice: toNumber(row.pchs_avg_pric),
        price: toNumber(row.now_pric2),
        currency: (row.tr_crcy_cd ?? "USD").trim() || "USD",
      });
    }

    const record = body as unknown as Record<string, string>;
    fk = record.ctx_area_fk200?.trim() ?? "";
    nk = record.ctx_area_nk200?.trim() ?? "";
    trCont = nextTrCont;
    if (!trCont || !nk) break;
  }

  return positions;
}

export async function fetchBalance(): Promise<BalanceResult> {
  const [domestic, overseas] = await Promise.all([
    fetchDomestic(),
    fetchOverseas(),
  ]);

  return {
    domestic: domestic.positions,
    overseas,
    cashKrw: domestic.cashKrw,
  };
}
