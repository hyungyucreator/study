/** 한 종목의 관측된 시세 한 건. */
export type Quote = {
  symbol: string;
  /** 종목 표시통화 기준 가격. */
  price: number;
  currency: string;
  /** 우리가 이 값을 관측한 시각. 제공자의 체결시각이 아니다. */
  asOf: string;
  source: QuoteSource;
};

export type QuoteSource = "kis" | "yahoo" | "cash";

/** 원달러 환율. USD 자산을 원화로 환산할 때 쓴다. */
export type FxRate = {
  usdKrw: number;
  asOf: string;
  source: QuoteSource;
};
