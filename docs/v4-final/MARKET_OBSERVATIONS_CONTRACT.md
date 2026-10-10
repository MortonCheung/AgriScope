# 市场历史观测契约

`GET /api/market/observations?city=<六城slug>&crop=<正式品种>` 只读取启动时绑定的 Runtime 快照。未给品种时返回可用清单并选择土豆（若实际有数据），否则选择首个实际品种。接口不调用模型、采集器或研究工程。

返回 `cityId/cityName/unit/available/selectedCrop/snapshotVersion/crops/series`。`unit` 固定为 `元/kg`，`snapshotVersion` 为实际 Parquet 内容 SHA-256 的前16位。没有本城已发布市场表时 `available=false`，品种与序列为空，不借用其他城市。未知城市和本城没有的请求品种返回统一错误信封。

每条 series 含 `id/crop/productName/marketName/priceLevel/source/observations/notes`。价格线按城市、正式品种、原产品、市场、价格口径及来源分别建立。沈阳为官方批发价；朝阳为官方监测点均价；锦州的不同均价市场保留独立序列。生猪与仔猪等映射到同一标准类的产品也保留独立身份。

只接受有明确质量单位的原价格（斤、500克、公斤、kg、250g），排除 ml/L、未知或推定单位、代理/派生记录、加工品及不合格质量。既有 `price_per_kg` 直接透传，不修改正式表。同系列同日价格冲突时省略并记录，不求均值；缺日期保持缺口，不插值。来源链接沿用原记录；沈阳新增记录缺链接时只追溯同一 Daily 已登记来源。

前端使用正式 HTTP provider，无演示回退；请求包含城市/作物、支持 Abort、10秒超时、no-store，验证城市、作物、单位、日期顺序及有效价格。页面必须显示所选线真实最新日期及市场口径，不把历史观测视作模型能力，不把其他口径的新日期当作该线更新。
