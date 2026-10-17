import test from "node:test";
import assert from "node:assert/strict";
import { appStoreCampaignUrl, campaignFromParams, campaignToken } from "./appStore.ts";

const BASE = "https://apps.apple.com/app/apple-store/id6815586867?pt=129503013";

test("every App Store link carries the provider token, the campaign and mt=8", () => {
  assert.equal(appStoreCampaignUrl("website"), `${BASE}&ct=website&mt=8`);
  assert.equal(appStoreCampaignUrl("tiktok"), `${BASE}&ct=tiktok&mt=8`);
});

test("the campaign is utm_source, else ref, else website", () => {
  assert.equal(campaignFromParams(new URLSearchParams("utm_source=TikTok&ref=maya")), "tiktok");
  assert.equal(campaignFromParams(new URLSearchParams("ref=Maya_Studies")), "maya_studies");
  assert.equal(campaignFromParams(new URLSearchParams("utm_medium=social")), "website");
  assert.equal(campaignFromParams(new URLSearchParams("")), "website");
  assert.equal(campaignFromParams(new URLSearchParams("utm_source=")), "website");
});

test("campaign tokens are lower case, at most 25 characters, and safe in a link", () => {
  assert.equal(campaignToken("@Study.With.Maya"), "study.with.maya");
  assert.equal(campaignToken("A".repeat(40)), "a".repeat(25));
  assert.equal(campaignToken("ig story&x=1"), "igstoryx1");
  assert.equal(campaignToken("   "), "");
});
