import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeBreakeven } from "../founder-model";
import { resolveFounderCostInputs, resolveFounderTariffs } from "../founder-costs";
import {
  isCustomerPaidProSale,
  isFounderProSalesUsername,
} from "../../../database/proSalesExclude";

describe("pro sales exclude", () => {
  it("drops founder grants and unpaid test rows", () => {
    assert.equal(isFounderProSalesUsername("anriltine"), true);
    assert.equal(isFounderProSalesUsername("@Anriltine"), true);
    assert.equal(isCustomerPaidProSale("anriltine", 5), false);
    assert.equal(isCustomerPaidProSale("email_abc", 0), false);
    assert.equal(isCustomerPaidProSale("email_abc", 0.01), false);
    assert.equal(isCustomerPaidProSale("email_abc", 5), true);
  });
});

describe("computeBreakeven", () => {
  const tariffs = resolveFounderTariffs({
    monthUsd: 5,
    quarterTotalUsd: 13.5,
    yearTotalUsd: 48,
  });
  const costs = resolveFounderCostInputs();

  it("returns a finite user count when contribution is positive", () => {
    costs.variablePerActiveHourUsd = 0.08;
    costs.infra.railwayUsdMonth = 50;
    costs.tdlibFixedUntilUsers = 25;
    const be = computeBreakeven(tariffs, costs, 0.21, { vercelFixedUsdMonth: 38 });
    assert.equal(be.reachableInfra, true);
    assert.ok(be.payingUsersInfraOnly != null && be.payingUsersInfraOnly < 500);
    assert.equal(Number.isFinite(be.payingUsersInfraOnly), true);
  });

  it("marks unreachable instead of exploding when usage COGS ≥ ARPU", () => {
    costs.variablePerActiveHourUsd = 0.64;
    const be = computeBreakeven(tariffs, costs, 2.5, { vercelFixedUsdMonth: 38 });
    assert.equal(be.reachableInfra, false);
    assert.equal(be.payingUsersInfraOnly, null);
    assert.match(be.assumptions, /Unreachable/);
  });
});
