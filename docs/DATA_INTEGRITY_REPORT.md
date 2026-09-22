# 数据完整性报告（沈阳）

由 `scripts/sync-shenyang-v2.mjs` 生成，`scripts/verify-research-integrity.mjs` 复核。
口径（§20）：**源文件 SHA-256 必须等于 public 副本 SHA-256**；CSV 额外记录行数与列名。

- 文件总数 43
- CSV 28（表 25 + 推演 3）
- 图 2
- 文章 9
- 来源 16

| 文件 | 字节 | 行数 | 列数 | sha256 |
|---|---|---|---|---|
| public/research/shenyang/tables/A01_seasonal_amplitude.csv | 697 | 20 | 3 | 419e1e519428feca… |
| public/research/shenyang/tables/A01_trend.csv | 4501 | 20 | 13 | a06fe40e4a5e7b00… |
| public/research/shenyang/tables/A02_daily_response.csv | 56166 | 220 | 16 | bf31b00124b7d9bb… |
| public/research/shenyang/tables/A03_accumulation.csv | 11326 | 80 | 10 | 8a2456d2bfb5bbe4… |
| public/research/shenyang/tables/A03_lag_windows.csv | 22755 | 160 | 11 | f81812de2a6b54bb… |
| public/research/shenyang/tables/A03_nonlinearity.csv | 7477 | 80 | 9 | e850d4f008fad4cc… |
| public/research/shenyang/tables/A04_event_clusters.csv | 730 | 13 | 6 | b04843b966e6a580… |
| public/research/shenyang/tables/A04_event_summary.csv | 649 | 4 | 10 | b3d0453cd06aad6b… |
| public/research/shenyang/tables/A05_heterogeneity.csv | 393 | 4 | 7 | 70bb30da896013f6… |
| public/research/shenyang/tables/A05_recovery_by_crop.csv | 494 | 20 | 5 | 218f0cd7ee07abf5… |
| public/research/shenyang/tables/A06_forecast_gain.csv | 1929 | 20 | 6 | ba7542b9cce49218… |
| public/research/shenyang/tables/A06_price_volume.csv | 2080 | 11 | 10 | bcb480fc00900a19… |
| public/research/shenyang/tables/A07_district_crop_structure.csv | 3221 | 72 | 6 | 8bc1a1456982b3fc… |
| public/research/shenyang/tables/A07_district_grain.csv | 352 | 8 | 5 | c87dad40e230ab19… |
| public/research/shenyang/tables/A08_panel_results.csv | 10932 | 54 | 13 | 879d6c6f58bd55fd… |
| public/research/shenyang/tables/A08_robustness_loo.csv | 832 | 8 | 8 | 936bd1b2116bde27… |
| public/research/shenyang/tables/A08_wild_bootstrap.csv | 2508 | 36 | 5 | 86fef8884f3f0bf8… |
| public/research/shenyang/tables/A01_monthly.csv | 4728 | 120 | 7 | 31fc7185f0ba4027… |
| public/research/shenyang/tables/A01_seasonal_index.csv | 9355 | 240 | 5 | db88623c85245a67… |
| public/research/shenyang/tables/A01_stl_strength.csv | 1071 | 20 | 4 | ae352e820ecc9cc1… |
| public/research/shenyang/tables/A02_daily_response_Fwx.csv | 9044 | 100 | 7 | ab5208406c8bd092… |
| public/research/shenyang/tables/A04_event_responses.csv | 7721 | 140 | 7 | ef181012fe83f42f… |
| public/research/shenyang/tables/A05_recovery.csv | 6287 | 140 | 7 | 5af6076881234ee3… |
| public/research/shenyang/tables/A06_forecast_rolling.csv | 2603 | 40 | 6 | a2c0c2cf16350e4f… |
| public/research/shenyang/tables/A07_change_2018_2024.csv | 6329 | 72 | 8 | 8e84dbeed1ef940d… |
| public/scenario/shenyang/counterfactual_gate.csv | 107 | 2 | 5 | fa47d7c045ebb45a… |
| public/scenario/shenyang/counterfactual_severity.csv | 3458 | 44 | 6 | 935586b7b9217deb… |
| public/scenario/shenyang/counterfactual_buffer.csv | 1778 | 33 | 5 | 245aec5cfa72c217… |

## 缺口

| 类型 | 文件 |
|---|---|
| — | 无 |
