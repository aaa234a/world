// server.js
const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const cron = require("node-cron");
const { format } = require("date-fns");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

// ==========================================================
// MongoDB Connection
// ==========================================================
const connectDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("MongoDB Atlasに接続しました！");
  } catch (err) {
    console.error("MongoDB Atlas接続エラー:", err);
    process.exit(1);
  }
};

// ==========================================================
// Mongoose Models
// (通常は別のファイルに分割しますが、ユーザーの要望によりここに集約)
// ==========================================================

// Nation Model
const nationSchema = new mongoose.Schema(
  {
    originalId: { type: Number, unique: true, required: true },
    name: { type: String, required: true, unique: true, trim: true },
    color: { type: String, default: "#FFFFFF" },
    infantry: { type: Number, default: 0 },
    tank: { type: Number, default: 0 },
    mechanizedInfantry: { type: Number, default: 0 },
    bomber: { type: Number, default: 0 },
    money: { type: Number, default: 0 },
    population: { type: Number, default: 0 },
    territories: { type: [String], default: [] },
    owner: { type: String, required: true, unique: true, trim: true }, // IPアドレス
    missile: { type: Number, default: 0 },
    oil: { type: Number, default: 0 },
    iron: { type: Number, default: 0 },
    activeFocusId: { type: String, default: "" },
    focusTurnsRemaining: { type: Number, default: 0 },
    completedFocuses: { type: [String], default: [] },
    acquiredTitles: { type: [String], default: ["president"] },
    selectedTitleId: { type: String, default: "president" },
    flagUrl: { type: String, default: "" },
    invasionStatus: { type: String, default: "none" },
    nuclearMissile: { type: Number, default: 0 },
    artillery: { type: Number, default: 0 },
    railways: { type: Number, default: 0 },
    shinkansen: { type: Number, default: 0 },
    airports: { type: Number, default: 0 },
    tourismFacilities: { type: Number, default: 0 },
    flights: {
      // 飛行機便情報
      type: [
        {
          targetIp: { type: String, required: true },
          status: {
            type: String,
            enum: ["pending", "approved"],
            default: "pending",
          },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);
const Nation = mongoose.model("Nation", nationSchema);

// NewsLog Model (Capped Collection)
const newsLogSchema = new mongoose.Schema(
  {
    timestamp: { type: Date, default: Date.now },
    message: { type: String, required: true },
  },
  {
    capped: { size: 1024 * 1024 * 5, max: 100 }, // 5MB または 100件まで保持
  }
);
const NewsLog = mongoose.model("NewsLog", newsLogSchema);

// ChatLog Model (Capped Collection)
const chatLogSchema = new mongoose.Schema(
  {
    timestamp: { type: Date, default: Date.now },
    userIp: { type: String, required: true },
    nationName: { type: String, required: true },
    selectedTitleId: { type: String, default: "" },
    flagUrl: { type: String, default: "" },
    message: { type: String, required: true, maxlength: 200 },
  },
  {
    capped: { size: 1024 * 1024 * 5, max: 100 }, // 5MB または 100件まで保持
  }
);
const ChatLog = mongoose.model("ChatLog", chatLogSchema);

// Alliance Model
const allianceSchema = new mongoose.Schema({
  requesterIp: { type: String, required: true },
  requesterNationName: { type: String, required: true },
  approverIp: { type: String, required: true },
  approverNationName: { type: String, required: true },
  status: { type: String, enum: ["Pending", "Approved"], default: "Pending" },
  timestamp: { type: Date, default: Date.now },
});
allianceSchema.index({ requesterIp: 1, approverIp: 1 }, { unique: true }); // ユニークな同盟ペア
const Alliance = mongoose.model("Alliance", allianceSchema);

// Flight Request Model
const flightRequestSchema = new mongoose.Schema({
  requesterIp: { type: String, required: true },
  requesterNationName: { type: String, required: true },
  approverIp: { type: String, required: true },
  approverNationName: { type: String, required: true },
  status: { type: String, enum: ["Pending", "Approved"], default: "Pending" },
  timestamp: { type: Date, default: Date.now },
});
flightRequestSchema.index({ requesterIp: 1, approverIp: 1 }, { unique: true }); // ユニークなフライトペア
const FlightRequest = mongoose.model("FlightRequest", flightRequestSchema);

// War Model
const warSchema = new mongoose.Schema({
  warId: { type: String, unique: true, required: true },
  attackerIp: { type: String, required: true },
  attackerNationName: { type: String, required: true },
  defenderIp: { type: String, required: true },
  defenderNationName: { type: String, required: true },
  status: {
    type: String,
    enum: [
      "Declared",
      "Ongoing",
      "Ceasefire",
      "Ended",
      "Cancelled",
      "WhitePeaceProposed",
    ],
    default: "Declared",
  },
  attackerWarScore: { type: Number, default: 0 },
  defenderWarScore: { type: Number, default: 0 },
  startTime: { type: Date, default: Date.now },
  ceasefireProposedBy: { type: String, default: "" }, // IPアドレス
  initialTerritoryOwnership: { type: String, default: "{}" }, // JSON string of {territoryName: ownerIp}
});
const War = mongoose.model("War", warSchema);

// UserActivity Model
const userActivitySchema = new mongoose.Schema(
  {
    userIp: { type: String, unique: true, required: true },
    nationName: { type: String, default: "未登録の国" },
    lastSeen: { type: Date, default: Date.now },
    lastLoginDate: {
      type: String,
      default: () => format(Date.now(), "yyyy-MM-dd"),
    }, // 'yyyy-MM-dd' format
    rebellionCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);
const UserActivity = mongoose.model("UserActivity", userActivitySchema);

// ==========================================================
// Game Constants & National Focuses & Titles
// (通常は別のファイルに分割しますが、ユーザーの要望によりここに集約)
// ==========================================================
const constants = {
  BASE_TERRITORY_COST: 1000,
  INFANTRY_COST: 30,
  TANK_COST: 70,
  MECHANIZED_INFANTRY_COST: 50,
  BOMBER_COST: 90,
  MISSILE_COST: 10000,
  NUCLEAR_MISSILE_COST: 50000,
  NUCLEAR_MISSILE_OIL_COST: 500,
  NUCLEAR_MISSILE_IRON_COST: 1000,
  NUCLEAR_MISSILE_POP_DESTRUCTION_PER_MISSILE: 50000,
  NUCLEAR_MISSILE_UNIT_DESTRUCTION_RATE: 0.8,
  ARTILLERY_COST: 120,
  ARTILLERY_OIL_COST: 4,
  ARTILLERY_IRON_COST: 6,
  INFANTRY_OIL_COST: 1,
  INFANTRY_IRON_COST: 2,
  TANK_OIL_COST: 3,
  TANK_IRON_COST: 5,
  MECHANIZED_INFANTRY_OIL_COST: 2,
  MECHANIZED_INFANTRY_IRON_COST: 3,
  BOMBER_OIL_COST: 5,
  BOMBER_IRON_COST: 7,
  MISSILE_OIL_COST: 50,
  MISSILE_IRON_COST: 100,
  INFANTRY_POWER: 2,
  TANK_POWER: 7,
  MECHANIZED_INFANTRY_POWER: 4,
  ARTILLERY_POWER: 5,
  BOMBER_INFANTRY_DESTRUCTION_RATE: 0.4,
  BOMBER_TANK_DESTRUCTION_RATE: 0.3,
  BOMBER_MECH_DESTRUCTION_RATE: 0.3,
  SABOTAGE_COST: 1000,
  SABOTAGE_FAILURE_COST: 10000,
  SABOTAGE_SUCCESS_CHANCE: 0.4,
  SABOTAGE_UNIT_DESTRUCTION_RATE_MIN: 0.15,
  SABOTAGE_UNIT_DESTRUCTION_RATE_MAX: 0.3,
  SABOTAGE_MONEY_DESTRUCTION_RATE_MIN: 0.2,
  SABOTAGE_MONEY_DESTRUCTION_RATE_MAX: 0.4,
  SABOTAGE_RESOURCE_DESTRUCTION_RATE_MIN: 0.2,
  SABOTAGE_RESOURCE_DESTRUCTION_RATE_MAX: 0.4,
  SABOTAGE_POPULATION_DESTRUCTION_RATE_MIN: 0.005,
  SABOTAGE_POPULATION_DESTRUCTION_RATE_MAX: 0.01,
  SABOTAGE_MAX_INFANTRY_DESTROYED: 500,
  SABOTAGE_MAX_TANK_DESTROYED: 100,
  SABOTAGE_MAX_MECHANIZED_INFANTRY_DESTROYED: 200,
  SABOTAGE_MAX_BOMBER_DESTROYED: 50,
  SABOTAGE_MAX_MISSILE_DESTROYED: 1,
  SABOTAGE_MAX_NUCLEAR_MISSILE_DESTROYED: 0,
  SABOTAGE_MAX_ARTILLERY_DESTROYED: 50,
  SABOTAGE_MAX_MONEY_DESTROYED: 50000,
  SABOTAGE_MAX_OIL_DESTROYED: 200,
  SABOTAGE_MAX_IRON_DESTROYED: 200,
  SABOTAGE_MAX_POPULATION_DESTROYED: 10000,
  RAILWAY_COST: 5000,
  RAILWAY_IRON_COST: 50,
  RAILWAY_OIL_COST: 10,
  RAILWAY_MONEY_BONUS_PER_UNIT: 0.005,
  RAILWAY_POP_BONUS_PER_UNIT: 0.00001,
  SHINKANSEN_COST: 20000,
  SHINKANSEN_IRON_COST: 200,
  SHINKANSEN_OIL_COST: 50,
  SHINKANSEN_MONEY_BONUS_PER_UNIT: 0.015,
  SHINKANSEN_POP_BONUS_PER_UNIT: 0.00003,
  AIRPORT_COST: 15000,
  AIRPORT_IRON_COST: 100,
  AIRPORT_OIL_COST: 30,
  AIRPORT_MONEY_BONUS_PER_UNIT: 0.008,
  TOURISM_FACILITY_COST: 8000,
  TOURISM_FACILITY_IRON_COST: 40,
  TOURISM_FACILITY_OIL_COST: 20,
  TOURISM_FACILITY_MONEY_BONUS_PER_UNIT: 0.01,
  TOURISM_FACILITY_POP_BONUS_PER_UNIT: 0.000015,
  FLIGHT_POPULATION_TRANSFER_RATE: 0.00007,
  FLIGHT_MONEY_GAIN_PER_TURN: 500,
  MAX_REBELLIONS: 2,
  REBELLION_RESOURCE_FACTOR: 0.1,
  REBELLION_POPULATION_FACTOR: 0.05,
  MIN_STARTING_MONEY: 10000,
  MIN_STARTING_POPULATION: 10000,
  MIN_STARTING_INFANTRY: 100,
  WAR_STATUS_WHITE_PEACE_PROPOSED: "WhitePeaceProposed",
  WAR_POINT_INFANTRY: 1,
  WAR_POINT_TANK: 3,
  WAR_POINT_MECHANIZED_INFANTRY: 2,
  WAR_POINT_BOMBER: 5,
  WAR_POINT_MISSILE: 10,
  WAR_POINT_NUCLEAR_MISSILE: 50,
  WAR_POINT_ARTILLERY: 2,
  WAR_POINT_TERRITORY_CAPTURE: 50,
  PEACE_COST_MONEY_PER_1000: 1,
  PEACE_COST_INFANTRY: 1,
  PEACE_COST_TANK: 3,
  PEACE_COST_MECHANIZED_INFANTRY: 2,
  PEACE_COST_BOMBER: 5,
  PEACE_COST_MISSILE: 10,
  PEACE_COST_NUCLEAR_MISSILE: 50,
  PEACE_COST_ARTILLERY: 2,
  PEACE_COST_OIL_PER_10: 1,
  PEACE_COST_IRON_PER_10: 1,
  PEACE_COST_TERRITORY: 100,
};

const NATIONAL_FOCUSES = {
  industrial_expansion: {
    name: "産業拡大",
    description: "鉄と石油の生産量を増加させ、経済を活性化します。",
    costTurns: 5,
    effects: {
      ironProductionBonus: 0.2,
      oilProductionBonus: 0.2,
      moneyProductionBonus: 0.1,
    },
    prerequisites: [],
    exclusiveWith: [],
  },
  automation_push: {
    name: "自動化推進",
    description: "工場の自動化により資源効率が向上します。",
    costTurns: 6,
    effects: { ironProductionBonus: 0.15, moneyProductionBonus: 0.1 },
    prerequisites: ["industrial_expansion"],
    exclusiveWith: [],
  },
  green_energy_program: {
    name: "再生可能エネルギー計画",
    description: "石油依存を軽減し経済をクリーンにします。",
    costTurns: 8,
    effects: { oilProductionBonus: 0.15, moneyProductionBonus: 0.05 },
    prerequisites: ["industrial_expansion"],
    exclusiveWith: [],
  },
  capitalist_economy: {
    name: "自由市場経済",
    description: "市場経済を推進し民間投資を活性化させます。",
    costTurns: 7,
    effects: { moneyProductionBonus: 0.07 },
    prerequisites: ["industrial_expansion"],
    exclusiveWith: ["resource_nationalization"],
  },
  resource_nationalization: {
    name: "資源の国有化",
    description: "資源管理を国家主導に切り替え効率的にします。",
    costTurns: 7,
    effects: { ironProductionBonus: 0.1, oilProductionBonus: 0.1 },
    prerequisites: ["industrial_expansion"],
    exclusiveWith: ["capitalist_economy"],
  },
  trade_liberalization: {
    name: "貿易自由化",
    description:
      "貿易障壁を撤廃し、国際的な経済活動を促進します。経済成長を加速させます。",
    costTurns: 6,
    effects: { moneyProductionBonus: 0.08 },
    prerequisites: ["capitalist_economy"],
    exclusiveWith: [],
  },
  infrastructure_development: {
    name: "インフラ整備計画",
    description:
      "道路、港湾、通信網などのインフラを大規模に整備し、経済効率と資源輸送能力を向上させます。",
    costTurns: 8,
    effects: {
      ironProductionBonus: 0.08,
      oilProductionBonus: 0.08,
      moneyProductionBonus: 0.05,
    },
    prerequisites: ["industrial_expansion"],
    exclusiveWith: [],
  },
  advanced_research_institutes: {
    name: "先端研究機関設立",
    description:
      "科学技術研究への投資を拡大し、イノベーションを加速させます。生産性と経済成長に寄与します。",
    costTurns: 9,
    effects: {
      moneyProductionBonus: 0.07,
      oilProductionBonus: 0.03,
      ironProductionBonus: 0.03,
    },
    prerequisites: ["education_campaign"],
    exclusiveWith: [],
  },
  financial_hub_development: {
    name: "国際金融ハブ構築",
    description:
      "金融市場の規制緩和と優遇措置により、国際的な金融取引の中心地を目指します。莫大な金融収入をもたらします。",
    costTurns: 7,
    effects: { moneyProductionBonus: 0.1 },
    prerequisites: ["capitalist_economy"],
    exclusiveWith: [],
  },
  resource_exploration_program: {
    name: "国内資源探査プログラム",
    description:
      "未開発の資源地帯の探査を強化し、国内の資源生産量を増やします。",
    costTurns: 6,
    effects: { oilProductionBonus: 0.12, ironProductionBonus: 0.12 },
    prerequisites: ["industrial_expansion"],
    exclusiveWith: [],
  },
  digital_economy_initiative: {
    name: "デジタル経済推進",
    description:
      "デジタル技術の導入を推進し、新たな産業と雇用を創出します。経済全体の効率を高めます。",
    costTurns: 7,
    effects: { moneyProductionBonus: 0.09 },
    prerequisites: ["ai_integration"],
    exclusiveWith: [],
  },
  tourism_industry_development: {
    name: "観光業発展",
    description: "観光収入と人口増加を促進します。",
    costTurns: 6,
    effects: { populationGrowthBonus: 0.002, moneyProductionBonus: 0.02 },
    prerequisites: [],
    exclusiveWith: [],
  },
  cultural_heritage_promotion: {
    name: "文化遺産保護・活用",
    description:
      "歴史的・文化的遺産の保護と観光資源としての活用を促進し、長期的な観光客誘致を図ります。",
    costTurns: 5,
    effects: { moneyProductionBonus: 0.03, populationGrowthBonus: 0.001 },
    prerequisites: ["tourism_industry_development"],
    exclusiveWith: [],
  },
  eco_tourism_development: {
    name: "エコツーリズム推進",
    description:
      "自然環境を保全しつつ、その魅力を活かした持続可能な観光を推進します。新たな観光層を開拓します。",
    costTurns: 6,
    effects: { moneyProductionBonus: 0.035, populationGrowthBonus: 0.0005 },
    prerequisites: ["tourism_industry_development"],
    exclusiveWith: [],
  },
  international_tourism_campaign: {
    name: "国際観光誘致キャンペーン",
    description:
      "大規模な国際プロモーション活動を展開し、海外からの観光客を積極的に誘致します。",
    costTurns: 7,
    effects: { moneyProductionBonus: 0.05, populationGrowthBonus: 0.0015 },
    prerequisites: ["tourism_industry_development", "education_campaign"],
    exclusiveWith: [],
  },
  visa_liberalization_program: {
    name: "査証緩和プログラム",
    description:
      "特定の国からの観光客に対する入国査証（ビザ）要件を緩和し、観光客数を大幅に増加させます。",
    costTurns: 4,
    effects: { moneyProductionBonus: 0.04, populationGrowthBonus: 0.0001 },
    prerequisites: ["tourism_industry_development"],
    exclusiveWith: [],
  },
  luxury_tourism_infrastructure: {
    name: "高級観光インフラ整備",
    description:
      "富裕層をターゲットとした高級ホテル、リゾート、交通網を整備し、高単価の観光収入を追求します。",
    costTurns: 8,
    effects: {
      moneyProductionBonus: 0.06,
      oilProductionBonus: 0.02,
      ironProductionBonus: 0.02,
    },
    prerequisites: [
      "tourism_industry_development",
      "infrastructure_development",
    ],
    exclusiveWith: [],
  },
  military_modernization: {
    name: "軍事近代化",
    description: "歩兵と戦車の戦闘力を向上させます。",
    costTurns: 7,
    effects: { infantryPowerBonus: 1, tankPowerBonus: 1 },
    prerequisites: [],
    exclusiveWith: [],
  },
  elite_infantry_training: {
    name: "精鋭歩兵訓練",
    description: "歩兵部隊の精鋭化で戦力増強。",
    costTurns: 5,
    effects: { infantryPowerBonus: 1.5 },
    prerequisites: ["military_modernization"],
    exclusiveWith: [],
  },
  mechanized_warfare_doctrine: {
    name: "機械化戦術ドクトリン",
    description: "機械化歩兵と戦車を強化します。",
    costTurns: 8,
    effects: { mechanizedInfantryPowerBonus: 2, tankPowerBonus: 0.5 },
    prerequisites: ["military_modernization"],
    exclusiveWith: [],
  },
  missile_development: {
    name: "ミサイル開発",
    description: "ミサイルのコストを削減します。",
    costTurns: 6,
    effects: { missileCostReduction: 0.1 },
    prerequisites: [],
    exclusiveWith: [],
  },
  mass_missile_production: {
    name: "ミサイル量産体制",
    description: "さらに大量のミサイル生産が可能に。",
    costTurns: 7,
    effects: { missileCostReduction: 0.05 },
    prerequisites: ["missile_development"],
    exclusiveWith: [],
  },
  air_force_logistics: {
    name: "空軍兵站最適化",
    description: "爆撃機の生産効率を上げます。",
    costTurns: 5,
    effects: { bomberCostReduction: 0.1 },
    prerequisites: [],
    exclusiveWith: [],
  },
  advanced_aircraft_development: {
    name: "先進航空機開発",
    description: "爆撃機の性能向上とコスト削減。",
    costTurns: 7,
    effects: { bomberCostReduction: 0.05 },
    prerequisites: ["air_force_logistics"],
    exclusiveWith: [],
  },
  advanced_military_research: {
    name: "先端軍事研究",
    description: "高度な軍事技術の研究を推進し、新たな兵器開発の道を開きます。",
    costTurns: 8,
    effects: {},
    prerequisites: ["military_modernization", "education_campaign"],
    exclusiveWith: [],
  },
  nuclear_weapons_development: {
    name: "核兵器開発",
    description:
      "究極の抑止力である核兵器の開発を完了し、国家の安全保障を確立します。核ミサイルの製造が可能になります。",
    costTurns: 15,
    effects: {},
    prerequisites: ["advanced_military_research", "missile_development"],
    exclusiveWith: [],
  },
  artillery_modernization: {
    name: "砲兵部隊近代化",
    description:
      "最新の砲兵システムを導入し、陸上部隊の火力支援能力を大幅に向上させます。砲兵ユニットの製造が可能になります。",
    costTurns: 7,
    effects: {},
    prerequisites: ["military_modernization"],
    exclusiveWith: [],
  },
  national_fortification_program: {
    name: "国家要塞化計画",
    description: "全体防御力を向上させます。",
    costTurns: 6,
    effects: { defenseBonusIncrease: 0.1 },
    prerequisites: [],
    exclusiveWith: [],
  },
  bunker_construction: {
    name: "地下施設建設",
    description: "持久戦に備えた防衛強化。",
    costTurns: 8,
    effects: { defenseBonusIncrease: 0.2 },
    prerequisites: ["national_fortification_program"],
    exclusiveWith: [],
  },
  border_patrol_expansion: {
    name: "国境警備強化",
    description: "小規模な防衛を国境に配置します。",
    costTurns: 4,
    effects: { defenseBonusIncrease: 0.05 },
    prerequisites: ["national_fortification_program"],
    exclusiveWith: [],
  },
  population_growth_initiative: {
    name: "人口増加計画",
    description: "出生率を高め国力を上げます。",
    costTurns: 4,
    effects: { populationGrowthBonus: 0.0002 },
    prerequisites: [],
    exclusiveWith: [],
  },
  education_campaign: {
    name: "教育キャンペーン",
    description: "教育向上で人口と経済に好影響。",
    costTurns: 6,
    effects: { populationGrowthBonus: 0.0001, moneyProductionBonus: 0.03 },
    prerequisites: ["population_growth_initiative"],
    exclusiveWith: [],
  },
  urbanization_drive: {
    name: "都市化推進",
    description: "都市への集中投資で発展を加速。",
    costTurns: 7,
    effects: { moneyProductionBonus: 0.04, populationGrowthBonus: 0.0001 },
    prerequisites: ["population_growth_initiative"],
    exclusiveWith: [],
  },
  labor_mobility_policy: {
    name: "労働移動政策",
    description: "都市と農村のバランスを改善。",
    costTurns: 5,
    effects: { moneyProductionBonus: 0.02, populationGrowthBonus: 0.0001 },
    prerequisites: ["urbanization_drive"],
    exclusiveWith: [],
  },
  space_program_start: {
    name: "宇宙開発計画開始",
    description: "宇宙産業への第一歩。",
    costTurns: 10,
    effects: { moneyProductionBonus: 0.03 },
    prerequisites: ["education_campaign"],
    exclusiveWith: [],
  },
  satellite_network: {
    name: "人工衛星ネットワーク整備",
    description: "軍事と通信を支援する衛星網を構築します。",
    costTurns: 7,
    effects: { defenseBonusIncrease: 0.05, missileCostReduction: 0.05 },
    prerequisites: ["space_program_start"],
    exclusiveWith: [],
  },
  ai_integration: {
    name: "AI統合",
    description: "AI導入による生産最適化。",
    costTurns: 8,
    effects: { moneyProductionBonus: 0.06 },
    prerequisites: ["automation_push"],
    exclusiveWith: [],
  },
  drone_development: {
    name: "ドローン開発",
    description: "無人兵器の導入による戦力強化。",
    costTurns: 7,
    effects: { mechanizedInfantryPowerBonus: 1 },
    prerequisites: ["ai_integration"],
    exclusiveWith: [],
  },
};

const TITLE_DEFINITIONS = {
  president: { name: "大統領", color: "#3498db" },
  emperor: { name: "皇帝", color: "#FFD700" },
  warlord: { name: "軍閥", color: "#dc3545" },
  innovator: { name: "革新者", color: "#17a2b8" },
  economist: { name: "経済学者", color: "#28a745" },
  diplomat: { name: "外交官", color: "#6c757d" },
  tycoon: { name: "大物", color: "#fd7e14" },
  scholar: { name: "学者", color: "#6f42c1" },
  commander: { name: "司令官", color: "#007bff" },
  pioneer: { name: "開拓者", color: "#20c997" },
  guardian: { name: "守護者", color: "#6c757d" },
};

// ==========================================================
// Middleware & Helpers
// ==========================================================
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ヘルパー関数: ニュースログの追加
async function addNews(message) {
  if (message.includes("増強しました")) {
    return;
  }
  try {
    await NewsLog.create({ message });
  } catch (error) {
    console.error("ニュースログの保存中にエラー:", error);
  }
}

// ヘルパー関数: IPアドレス認証ミドルウェア (x-forwarded-for も考慮)
const ALWAYS_ALLOWED_IPS = ["127.0.0.1", "::1"]; // テスト用、またはゲーム管理者IPなど
const authenticateUser = (req, res, next) => {
  let ip =
    req.headers["x-forwarded-for"] || req.connection.remoteAddress || req.ip;
  if (ip && ip.startsWith("::ffff:")) {
    // IPv6形式のIPv4アドレスの場合
    ip = ip.substring(7);
  }
  req.userIp = ip;
  next();
};
app.use(authenticateUser);

// ユーザーIPをクライアントに返すエンドポイント
app.get("/api/user/ip", (req, res) => {
  res.json({ ip: req.userIp });
});

// ヘルパー関数: 国情報をIPで取得
async function getNationInfoByIp(ip) {
  return Nation.findOne({ owner: ip });
}

// ヘルパー関数: 国情報を国名で取得
async function getNationInfoByName(nationName) {
  return Nation.findOne({ name: nationName });
}

// ヘルパー関数: ユーザーのアクティビティを更新
async function updateUserActivity(userIp, nationName = "未登録の国") {
  const currentTime = new Date();
  const todayDateString = format(currentTime, "yyyy-MM-dd");
  const update = {
    nationName,
    lastSeen: currentTime,
    lastLoginDate: todayDateString,
  };
  await UserActivity.findOneAndUpdate(
    { userIp },
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

// 滅亡国の処理
async function removeNationsWithoutTerritories() {
  try {
    const nationsToDelete = await Nation.find({
      $or: [{ territories: { $size: 0 } }, { population: { $lte: 0 } }],
    });

    for (const nation of nationsToDelete) {
      await addNews(`${nation.name}は滅亡しました。`);
      await Nation.deleteOne({ _id: nation._id });
      await Alliance.deleteMany({
        $or: [{ requesterIp: nation.owner }, { approverIp: nation.owner }],
      });
      await FlightRequest.deleteMany({
        $or: [{ requesterIp: nation.owner }, { approverIp: nation.owner }],
      });
      await War.updateMany(
        {
          $or: [{ attackerIp: nation.owner }, { defenderIp: nation.owner }],
          status: { $nin: ["Ended", "Cancelled"] },
        },
        { $set: { status: "Cancelled", ceasefireProposedBy: "" } }
      );
      await UserActivity.deleteOne({ userIp: nation.owner });
    }
  } catch (error) {
    console.error("removeNationsWithoutTerritories エラー:", error);
  }
}

// ==========================================================
// API Endpoints
// ==========================================================

// GET /api/nations
app.get("/api/nations", async (req, res) => {
  try {
    const nations = await Nation.find({
      territories: { $exists: true, $ne: [] },
    });
    const formattedNations = nations.map((n) => ({
      id: n.originalId,
      name: n.name,
      color: n.color,
      infantry: n.infantry,
      tank: n.tank,
      mechanizedInfantry: n.mechanizedInfantry,
      bomber: n.bomber,
      money: n.money,
      population: n.population,
      territories: n.territories,
      owner: n.owner,
      missile: n.missile,
      oil: n.oil,
      iron: n.iron,
      activeFocusId: n.activeFocusId,
      focusTurnsRemaining: n.focusTurnsRemaining,
      completedFocuses: n.completedFocuses,
      acquiredTitles: n.acquiredTitles,
      selectedTitleId: n.selectedTitleId,
      flagUrl: n.flagUrl,
      invasionStatus: n.invasionStatus,
      nuclearMissile: n.nuclearMissile,
      artillery: n.artillery,
      railways: n.railways,
      shinkansen: n.shinkansen,
      airports: n.airports,
      tourismFacilities: n.tourismFacilities,
      flights: n.flights,
    }));
    const myNation = await Nation.findOne({ owner: req.userIp }); // req.userIpで再取得
    await updateUserActivity(
      req.userIp,
      myNation ? myNation.name : "未登録の国"
    );
    res.json(formattedNations);
  } catch (error) {
    console.error("getNations エラー:", error);
    res.status(500).json({
      success: false,
      message: "国の情報取得中にエラーが発生しました。",
    });
  }
});

// POST /api/registerNation
app.post("/api/registerNation", async (req, res) => {
  const userIp = req.userIp;
  const { nationName, countryName } = req.body;

  if (!userIp)
    return res
      .status(401)
      .json({ success: false, message: "IPアドレスが取得できません。" });
  if (!nationName || nationName.trim() === "")
    return res
      .status(400)
      .json({ success: false, message: "国名を入力してください。" });
  if (!countryName || countryName.trim() === "")
    return res
      .status(400)
      .json({ success: false, message: "領土名が不正です。" });

  try {
    if (await Nation.findOne({ owner: userIp }))
      return res.status(409).json({
        success: false,
        message: "あなたはすでに国を持っているため登録できません。",
      });
    if (await Nation.findOne({ territories: countryName }))
      return res.status(409).json({
        success: false,
        message: "その領土はすでに所有されています。",
      });
    if (await Nation.findOne({ name: nationName }))
      return res.status(409).json({
        success: false,
        message: "その国名はすでに使用されています。",
      });

    const id = Date.now();
    const color =
      "#" +
      Math.floor(Math.random() * 16777215)
        .toString(16)
        .padStart(6, "0");

    const newNation = new Nation({
      originalId: id,
      name: nationName,
      color: color,
      infantry: 100,
      tank: 20,
      mechanizedInfantry: 0,
      bomber: 0,
      money: 10000,
      population: 10000,
      territories: [countryName],
      owner: userIp,
      missile: 0,
      oil: 100,
      iron: 100,
      acquiredTitles: ["president"],
      selectedTitleId: "president",
    });
    await newNation.save();
    await addNews(`${nationName}国が建国されました！`);
    await updateUserActivity(userIp, nationName);

    res.json({
      success: true,
      id: id,
      message: `${nationName}国が建国されました！`,
    });
  } catch (error) {
    console.error("registerNation エラー:", error);
    res
      .status(500)
      .json({ success: false, message: "国の登録中にエラーが発生しました。" });
  }
});

// POST /api/buyTerritory
app.post("/api/buyTerritory", async (req, res) => {
  const userIp = req.userIp;
  const { countryName } = req.body;

  if (!userIp)
    return res
      .status(401)
      .json({ success: false, message: "IPアドレスが取得できません。" });
  if (!countryName || countryName.trim() === "")
    return res
      .status(400)
      .json({ success: false, message: "領土名が不正です。" });

  try {
    const userNation = await Nation.findOne({ owner: userIp });
    if (!userNation)
      return res
        .status(404)
        .json({ success: false, message: "あなたはまだ国を持っていません。" });

    const territoriesCount = userNation.territories.length;
    const calculatedPurchasePrice =
      (territoriesCount + 1) * constants.BASE_TERRITORY_COST;

    if (userNation.money < calculatedPurchasePrice)
      return res.status(402).json({
        success: false,
        message: `お金が足りません。(必要: ${calculatedPurchasePrice}円)`,
      });
    if (await Nation.findOne({ territories: countryName }))
      return res.status(409).json({
        success: false,
        message: "その領土はすでに所有されています。",
      });

    const updatedNation = await Nation.findOneAndUpdate(
      { owner: userIp },
      {
        $inc: { money: -calculatedPurchasePrice, population: 1000 },
        $push: { territories: countryName },
      },
      { new: true }
    );

    await addNews(`${userNation.name} が ${countryName} を購入しました`);
    res.json({
      success: true,
      newMoney: updatedNation.money,
      calculatedPrice: calculatedPurchasePrice,
      message: `購入成功！残りのお金：${updatedNation.money}円。この領土の値段は${calculatedPurchasePrice}円でした。`,
    });
  } catch (error) {
    console.error("buyTerritory エラー:", error);
    res
      .status(500)
      .json({ success: false, message: "領土購入中にエラーが発生しました。" });
  }
});

// POST /api/reinforceArmy
app.post("/api/reinforceArmy", async (req, res) => {
  const userIp = req.userIp;
  const { type, amount } = req.body;

  if (!userIp)
    return res
      .status(401)
      .json({ success: false, message: "IPアドレスが取得できません。" });
  const parsedAmount = parseInt(amount, 10);
  if (isNaN(parsedAmount) || parsedAmount <= 0 || parsedAmount > 10000000) {
    return res
      .status(400)
      .json({ success: false, message: "正しい数量を入力してください。" });
  }

  try {
    const userNation = await Nation.findOne({ owner: userIp });
    if (!userNation)
      return res
        .status(404)
        .json({ success: false, message: "あなたの国が見つかりません。" });

    let cost = 0;
    let oilCost = 0;
    let ironCost = 0;
    let unitField = "";

    let missileCostReduction = 0;
    let bomberCostReduction = 0;
    userNation.completedFocuses.forEach((focusId) => {
      const focus = NATIONAL_FOCUSES[focusId];
      if (focus && focus.effects) {
        if (focus.effects.missileCostReduction)
          missileCostReduction += focus.effects.missileCostReduction;
        if (focus.effects.bomberCostReduction)
          bomberCostReduction += focus.effects.bomberCostReduction;
      }
    });

    switch (type) {
      case "infantry":
        cost = constants.INFANTRY_COST;
        oilCost = constants.INFANTRY_OIL_COST;
        ironCost = constants.INFANTRY_IRON_COST;
        unitField = "infantry";
        break;
      case "tank":
        cost = constants.TANK_COST;
        oilCost = constants.TANK_OIL_COST;
        ironCost = constants.TANK_IRON_COST;
        unitField = "tank";
        break;
      case "mechanizedInfantry":
        cost = constants.MECHANIZED_INFANTRY_COST;
        oilCost = constants.MECHANIZED_INFANTRY_OIL_COST;
        ironCost = constants.MECHANIZED_INFANTRY_IRON_COST;
        unitField = "mechanizedInfantry";
        break;
      case "bomber":
        cost = Math.max(
          1,
          Math.floor(constants.BOMBER_COST * (1 - bomberCostReduction))
        );
        oilCost = constants.BOMBER_OIL_COST;
        ironCost = constants.BOMBER_IRON_COST;
        unitField = "bomber";
        break;
      case "missile":
        cost = Math.max(
          1,
          Math.floor(constants.MISSILE_COST * (1 - missileCostReduction))
        );
        oilCost = constants.MISSILE_OIL_COST;
        ironCost = constants.MISSILE_IRON_COST;
        unitField = "missile";
        break;
      case "nuclearMissile":
        if (
          !userNation.completedFocuses.includes("nuclear_weapons_development")
        ) {
          return res.status(403).json({
            success: false,
            message: "核兵器開発の国家方針を完了していません。",
          });
        }
        cost = constants.NUCLEAR_MISSILE_COST;
        oilCost = constants.NUCLEAR_MISSILE_OIL_COST;
        ironCost = constants.NUCLEAR_MISSILE_IRON_COST;
        unitField = "nuclearMissile";
        break;
      case "artillery":
        if (!userNation.completedFocuses.includes("artillery_modernization")) {
          return res.status(403).json({
            success: false,
            message: "砲兵部隊近代化の国家方針を完了していません。",
          });
        }
        cost = constants.ARTILLERY_COST;
        oilCost = constants.ARTILLERY_OIL_COST;
        ironCost = constants.ARTILLERY_IRON_COST;
        unitField = "artillery";
        break;
      default:
        return res
          .status(400)
          .json({ success: false, message: "不明な兵器タイプです。" });
    }

    const totalCost = cost * parsedAmount;
    const totalOilCost = oilCost * parsedAmount;
    const totalIronCost = ironCost * parsedAmount;

    if (userNation.money < totalCost)
      return res.status(402).json({
        success: false,
        message: `お金が足りません。(必要: ${totalCost}円)`,
      });
    if (userNation.oil < totalOilCost)
      return res.status(402).json({
        success: false,
        message: `石油が足りません。(必要: ${totalOilCost}石油)`,
      });
    if (userNation.iron < totalIronCost)
      return res.status(402).json({
        success: false,
        message: `鉄が足りません。(必要: ${totalIronCost}鉄)`,
      });

    const updateData = {
      $inc: {
        money: -totalCost,
        oil: -totalOilCost,
        iron: -totalIronCost,
      },
    };
    updateData.$inc[unitField] = parsedAmount;

    const updatedNation = await Nation.findOneAndUpdate(
      { owner: userIp },
      updateData,
      { new: true }
    );

    await addNews(
      `${userNation.name} が ${type} を ${parsedAmount} 個増強しました。`
    );
    res.json({
      success: true,
      message: `${type} を ${parsedAmount} 個購入しました。残りのお金: ${updatedNation.money}円, 石油: ${updatedNation.oil}, 鉄: ${updatedNation.iron}`,
    });
  } catch (error) {
    console.error("reinforceArmy エラー:", error);
    res
      .status(500)
      .json({ success: false, message: "軍隊増強中にエラーが発生しました。" });
  }
});

// POST /api/buildInfrastructure
app.post("/api/buildInfrastructure", async (req, res) => {
  const userIp = req.userIp;
  const { type, amount } = req.body;

  if (!userIp)
    return res
      .status(401)
      .json({ success: false, message: "IPアドレスが取得できません。" });
  const parsedAmount = parseInt(amount, 10);
  if (isNaN(parsedAmount) || parsedAmount <= 0 || parsedAmount > 100) {
    return res.status(400).json({
      success: false,
      message: "正しい数量を入力してください。(上限: 100)",
    });
  }

  try {
    const userNation = await Nation.findOne({ owner: userIp });
    if (!userNation)
      return res
        .status(404)
        .json({ success: false, message: "あなたの国が見つかりません。" });

    let cost = 0;
    let oilCost = 0;
    let ironCost = 0;
    let infrastructureField = "";
    let infrastructureName = "";

    switch (type) {
      case "railway":
        cost = constants.RAILWAY_COST;
        oilCost = constants.RAILWAY_OIL_COST;
        ironCost = constants.RAILWAY_IRON_COST;
        infrastructureField = "railways";
        infrastructureName = "鉄道";
        break;
      case "shinkansen":
        cost = constants.SHINKANSEN_COST;
        oilCost = constants.SHINKANSEN_OIL_COST;
        ironCost = constants.SHINKANSEN_IRON_COST;
        infrastructureField = "shinkansen";
        infrastructureName = "新幹線";
        break;
      case "airport":
        cost = constants.AIRPORT_COST;
        oilCost = constants.AIRPORT_OIL_COST;
        ironCost = constants.AIRPORT_IRON_COST;
        infrastructureField = "airports";
        infrastructureName = "空港";
        break;
      case "tourismFacility":
        cost = constants.TOURISM_FACILITY_COST;
        oilCost = constants.TOURISM_FACILITY_OIL_COST;
        ironCost = constants.TOURISM_FACILITY_IRON_COST;
        infrastructureField = "tourismFacilities";
        infrastructureName = "観光施設";
        break;
      default:
        return res
          .status(400)
          .json({ success: false, message: "不明なインフラタイプです。" });
    }

    const totalCost = cost * parsedAmount;
    const totalOilCost = oilCost * parsedAmount;
    const totalIronCost = ironCost * parsedAmount;

    if (userNation.money < totalCost)
      return res.status(402).json({
        success: false,
        message: `お金が足りません。(必要: ${totalCost}円)`,
      });
    if (userNation.oil < totalOilCost)
      return res.status(402).json({
        success: false,
        message: `石油が足りません。(必要: ${totalOilCost}石油)`,
      });
    if (userNation.iron < totalIronCost)
      return res.status(402).json({
        success: false,
        message: `鉄が足りません。(必要: ${totalIronCost}鉄)`,
      });

    const updateData = {
      $inc: {
        money: -totalCost,
        oil: -totalOilCost,
        iron: -totalIronCost,
      },
    };
    updateData.$inc[infrastructureField] = parsedAmount;

    const updatedNation = await Nation.findOneAndUpdate(
      { owner: userIp },
      updateData,
      { new: true }
    );

    await addNews(
      `${userNation.name} が ${infrastructureName} を ${parsedAmount} 個建設しました。`
    );
    res.json({
      success: true,
      message: `${infrastructureName} を ${parsedAmount} 個建設しました。残りのお金: ${updatedNation.money}円, 石油: ${updatedNation.oil}, 鉄: ${updatedNation.iron}`,
    });
  } catch (error) {
    console.error("buildInfrastructure エラー:", error);
    res.status(500).json({
      success: false,
      message: "インフラ建設中にエラーが発生しました。",
    });
  }
});

// GET /api/getPendingFlightRequests
app.get("/api/getPendingFlightRequests", async (req, res) => {
  const userIp = req.userIp;
  if (!userIp)
    return res
      .status(401)
      .json({ success: false, message: "IPアドレスが取得できません。" });

  try {
    const pendingRequests = await FlightRequest.find({
      approverIp: userIp,
      status: "Pending",
    });
    res.json(pendingRequests);
  } catch (error) {
    console.error("getPendingFlightRequests エラー:", error);
    res.status(500).json({
      success: false,
      message: "飛行機便申請の取得中にエラーが発生しました。",
    });
  }
});

// GET /api/getEstablishedFlights
app.get("/api/getEstablishedFlights", async (req, res) => {
  const userIp = req.userIp;
  if (!userIp)
    return res
      .status(401)
      .json({ success: false, message: "IPアドレスが取得できません。" });

  try {
    const userNation = await Nation.findOne({ owner: userIp }).select(
      "flights"
    );
    if (!userNation) return res.json([]);

    const allNations = await Nation.find({}).select("owner name");
    const validFlights = userNation.flights.filter((flight) => {
      const targetNation = allNations.find((n) => n.owner === flight.targetIp);
      return flight.status === "approved" && targetNation;
    });

    const formattedFlights = validFlights.map((flight) => {
      const targetNation = allNations.find((n) => n.owner === flight.targetIp);
      return {
        targetIp: flight.targetIp,
        targetNationName: targetNation ? targetNation.name : "不明な国",
        status: flight.status,
      };
    });
    res.json(formattedFlights);
  } catch (error) {
    console.error("getEstablishedFlights エラー:", error);
    res.status(500).json({
      success: false,
      message: "確立された飛行機便の取得中にエラーが発生しました。",
    });
  }
});

// POST /api/requestFlight
app.post("/api/requestFlight", async (req, res) => {
  const userIp = req.userIp;
  const { targetNationName } = req.body;

  if (!userIp)
    return res
      .status(401)
      .json({ success: false, message: "IPアドレスが取得できません。" });
  if (!targetNationName || targetNationName.trim() === "")
    return res.status(400).json({
      success: false,
      message: "飛行機便申請先の国名を入力してください。",
    });

  try {
    const requesterNation = await Nation.findOne({ owner: userIp });
    if (!requesterNation)
      return res
        .status(404)
        .json({ success: false, message: "あなたの国が見つかりません。" });
    const approverNation = await Nation.findOne({ name: targetNationName });
    if (!approverNation)
      return res.status(404).json({
        success: false,
        message: "飛行機便申請先の国が見つかりません。",
      });
    if (requesterNation.owner === approverNation.owner)
      return res.status(400).json({
        success: false,
        message: "自分自身と飛行機便を組むことはできません。",
      });

    if (requesterNation.airports === 0)
      return res.status(403).json({
        success: false,
        message: "飛行機便を申請するには、空港を建設する必要があります。",
      });
    if (approverNation.airports === 0)
      return res.status(403).json({
        success: false,
        message: "相手国に空港が建設されていません。",
      });

    const existingFlight = await FlightRequest.findOne({
      $or: [
        {
          requesterIp: requesterNation.owner,
          approverIp: approverNation.owner,
        },
        {
          requesterIp: approverNation.owner,
          approverIp: requesterNation.owner,
        },
      ],
      status: { $in: ["Pending", "Approved"] },
    });
    if (existingFlight) {
      if (existingFlight.status === "Approved")
        return res.status(409).json({
          success: false,
          message: `${targetNationName}とはすでに飛行機便が確立されています。`,
        });
      if (existingFlight.requesterIp === requesterNation.owner)
        return res.status(409).json({
          success: false,
          message: `${targetNationName}への飛行機便申請はすでに送信済みです。`,
        });
      return res.status(409).json({
        success: false,
        message: `${targetNationName}からあなたへの飛行機便申請がすでにあります。そちらを承認してください。`,
      });
    }

    await FlightRequest.create({
      requesterIp: requesterNation.owner,
      requesterNationName: requesterNation.name,
      approverIp: approverNation.owner,
      approverNationName: approverNation.name,
      status: "Pending",
    });
    await addNews(
      `${requesterNation.name}が${approverNation.name}に飛行機便を申請しました。`
    );
    res.json({
      success: true,
      message: `${targetNationName}に飛行機便申請を送信しました。`,
    });
  } catch (error) {
    console.error("requestFlight エラー:", error);
    res.status(500).json({
      success: false,
      message: "飛行機便申請中にエラーが発生しました。",
    });
  }
});

// POST /api/respondToFlightRequest
app.post("/api/respondToFlightRequest", async (req, res) => {
  const userIp = req.userIp;
  const { requesterIp, response } = req.body;

  if (!userIp)
    return res
      .status(401)
      .json({ success: false, message: "IPアドレスが取得できません。" });
  if (!requesterIp || (response !== "approve" && response !== "reject"))
    return res
      .status(400)
      .json({ success: false, message: "不正なリクエストです。" });

  try {
    const flightRequest = await FlightRequest.findOne({
      requesterIp,
      approverIp: userIp,
      status: "Pending",
    });
    if (!flightRequest)
      return res.status(404).json({
        success: false,
        message: "該当する飛行機便申請が見つかりません。",
      });

    if (response === "approve") {
      await FlightRequest.updateOne(
        { _id: flightRequest._id },
        { $set: { status: "Approved" } }
      );

      await Nation.bulkWrite([
        {
          updateOne: {
            filter: { owner: requesterIp },
            update: {
              $push: { flights: { targetIp: userIp, status: "approved" } },
            },
          },
        },
        {
          updateOne: {
            filter: { owner: userIp },
            update: {
              $push: { flights: { targetIp: requesterIp, status: "approved" } },
            },
          },
        },
      ]);

      await addNews(
        `${flightRequest.approverNationName}が${flightRequest.requesterNationName}との飛行機便を承認しました！`
      );
      res.json({
        success: true,
        message: `${flightRequest.requesterNationName}との飛行機便を承認しました。`,
      });
    } else if (response === "reject") {
      await FlightRequest.deleteOne({ _id: flightRequest._id });
      await addNews(
        `${flightRequest.approverNationName}が${flightRequest.requesterNationName}との飛行機便を拒否しました。`
      );
      res.json({
        success: true,
        message: `${flightRequest.requesterNationName}との飛行機便を拒否しました。`,
      });
    }
  } catch (error) {
    console.error("respondToFlightRequest エラー:", error);
    res.status(500).json({
      success: false,
      message: "飛行機便申請への応答中にエラーが発生しました。",
    });
  }
});

// POST /api/attackTerritory
app.post("/api/attackTerritory", async (req, res) => {
  const userIp = req.userIp;
  const {
    targetCountryName,
    attackInfantry,
    attackTank,
    attackMechanizedInfantry,
    attackArtillery,
  } = req.body;

  if (!userIp)
    return res
      .status(401)
      .json({ success: false, message: "IPアドレスが取得できません。" });
  // 入力バリデーションは省略しますが、必ずサーバーサイドで行ってください (client.js側に記述はあり)
  const validAmount = (val) => !(isNaN(val) || val < 0 || val > 10000000);
  if (
    !validAmount(attackInfantry) ||
    !validAmount(attackTank) ||
    !validAmount(attackMechanizedInfantry) ||
    !validAmount(attackArtillery)
  ) {
    return res
      .status(400)
      .json({ success: false, message: "攻撃兵力は正しく入力してください。" });
  }

  try {
    let attackerNation = await Nation.findOne({ owner: userIp });
    if (!attackerNation)
      return res
        .status(404)
        .json({ success: false, message: "あなたの国が見つかりません。" });
    if (attackerNation.invasionStatus === "in_progress")
      return res.status(409).json({
        success: false,
        message: "現在、別の攻撃が進行中です。完了するまでお待ちください。",
      });

    // 即座にinvasionStatusを更新
    await Nation.updateOne(
      { owner: userIp },
      { $set: { invasionStatus: "in_progress" } }
    );

    // 部隊が足りるかチェック & 消費
    if (
      attackerNation.infantry < attackInfantry ||
      attackerNation.tank < attackTank ||
      attackerNation.mechanizedInfantry < attackMechanizedInfantry ||
      attackerNation.artillery < attackArtillery
    ) {
      await Nation.updateOne(
        { owner: userIp },
        { $set: { invasionStatus: "none" } }
      ); // リセット
      return res
        .status(402)
        .json({ success: false, message: "指定した兵力が足りません。" });
    }
    await Nation.updateOne(
      { owner: userIp },
      {
        $inc: {
          infantry: -attackInfantry,
          tank: -attackTank,
          mechanizedInfantry: -attackMechanizedInfantry,
          artillery: -attackArtillery,
        },
      }
    );
    // DBから最新のattackerNation情報を再取得 (消費後の状態)
    attackerNation = await Nation.findOne({ owner: userIp });

    const defenderNation = await Nation.findOne({
      territories: targetCountryName,
    });
    if (!defenderNation) {
      await Nation.updateOne(
        { owner: userIp },
        { $set: { invasionStatus: "none" } }
      );
      return res.status(404).json({
        success: false,
        message: "目標の領土を所有する国が見つかりません。",
      });
    }
    if (attackerNation.owner === defenderNation.owner) {
      await Nation.updateOne(
        { owner: userIp },
        { $set: { invasionStatus: "none" } }
      );
      return res.status(400).json({
        success: false,
        message: "自国の領土を攻撃することはできません。",
      });
    }

    // 戦争宣言ロジック
    let war = await War.findOne({
      $or: [
        { attackerIp: userIp, defenderIp: defenderNation.owner },
        { attackerIp: defenderNation.owner, defenderIp: userIp },
      ],
      status: { $nin: ["Ended", "Cancelled"] },
    });

    if (!war) {
      const allTerritoriesData = await Nation.find({})
        .select("territories owner")
        .lean();
      const initialTerritoryOwnershipMap = {};
      allTerritoriesData.forEach((nat) => {
        nat.territories.forEach((t) => {
          initialTerritoryOwnershipMap[t] = nat.owner;
        });
      });

      const newWar = await War.create({
        warId: Date.now().toString(),
        attackerIp: userIp,
        attackerNationName: attackerNation.name,
        defenderIp: defenderNation.owner,
        defenderNationName: defenderNation.name,
        status: "Declared",
        initialTerritoryOwnership: JSON.stringify(initialTerritoryOwnershipMap),
      });
      war = newWar;
      await addNews(
        `${attackerNation.name} が ${defenderNation.name} に宣戦布告しました！`
      );
    }

    await addNews(
      `${attackerNation.name} が ${defenderNation.name} の ${targetCountryName} への侵略を開始しました。30秒間、侵略中となります。`
    );

    // 非同期待機: サーバーをブロックしないように Promise と setTimeout を使用
    await new Promise((resolve) => setTimeout(resolve, 10 * 1000)); // 10秒待機 (テスト用に短縮)

    // 待機後、最新の防衛側情報を取得
    let updatedDefenderNation = await Nation.findOne({
      owner: defenderNation.owner,
    });
    if (!updatedDefenderNation) {
      await Nation.updateOne(
        { owner: userIp },
        { $set: { invasionStatus: "none" } }
      );
      await addNews(
        `${attackerNation.name} の ${targetCountryName} への侵略は、防衛国がすでに滅亡していたため中止されました。`
      );
      return res.status(200).json({
        success: false,
        message: `侵略は中止されました。防衛国はもはや存在しません。`,
      });
    }
    if (!updatedDefenderNation.territories.includes(targetCountryName)) {
      await Nation.updateOne(
        { owner: userIp },
        { $set: { invasionStatus: "none" } }
      );
      await addNews(
        `${attackerNation.name} の ${targetCountryName} への侵略は、防衛国がすでに領土を失っていたため中止されました。`
      );
      return res.status(200).json({
        success: false,
        message: `侵略は中止されました。${targetCountryName} はもはや防衛国の領土ではありません。`,
      });
    }

    // --- 戦闘計算 ---
    const totalDefenderInfantry = updatedDefenderNation.infantry;
    const totalDefenderTank = updatedDefenderNation.tank;
    const totalDefenderMechInf = updatedDefenderNation.mechanizedInfantry;
    const totalDefenderArtillery = updatedDefenderNation.artillery;
    const defenderTerritoryCount = updatedDefenderNation.territories.length;

    const defensePerTerritoryInf =
      defenderTerritoryCount > 0
        ? totalDefenderInfantry / defenderTerritoryCount
        : 0;
    const defensePerTerritoryTank =
      defenderTerritoryCount > 0
        ? totalDefenderTank / defenderTerritoryCount
        : 0;
    const defensePerTerritoryMechInf =
      defenderTerritoryCount > 0
        ? totalDefenderMechInf / defenderTerritoryCount
        : 0;
    const defensePerTerritoryArtillery =
      defenderTerritoryCount > 0
        ? totalDefenderArtillery / defenderTerritoryCount
        : 0;

    let infantryPowerBonus = 0;
    let tankPowerBonus = 0;
    let mechanizedInfantryPowerBonus = 0;
    attackerNation.completedFocuses.forEach((focusId) => {
      const focus = NATIONAL_FOCUSES[focusId];
      if (focus && focus.effects) {
        if (focus.effects.infantryPowerBonus)
          infantryPowerBonus += focus.effects.infantryPowerBonus;
        if (focus.effects.tankPowerBonus)
          tankPowerBonus += focus.effects.tankPowerBonus;
        if (focus.effects.mechanizedInfantryPowerBonus)
          mechanizedInfantryPowerBonus +=
            focus.effects.mechanizedInfantryPowerBonus;
      }
    });

    let defenseBonusIncrease = 0;
    updatedDefenderNation.completedFocuses.forEach((focusId) => {
      const focus = NATIONAL_FOCUSES[focusId];
      if (focus && focus.effects && focus.effects.defenseBonusIncrease) {
        defenseBonusIncrease += focus.effects.defenseBonusIncrease;
      }
    });

    const effectiveInfantryPower =
      constants.INFANTRY_POWER + infantryPowerBonus;
    const effectiveTankPower = constants.TANK_POWER + tankPowerBonus;
    const effectiveMechanizedInfantryPower =
      constants.MECHANIZED_INFANTRY_POWER + mechanizedInfantryPowerBonus;
    const effectiveArtilleryPower = constants.ARTILLERY_POWER;

    const attackPower =
      attackInfantry * effectiveInfantryPower +
      attackTank * effectiveTankPower +
      attackMechanizedInfantry * effectiveMechanizedInfantryPower +
      attackArtillery * effectiveArtilleryPower;

    const currentDefenseBonus = 1.2;
    const totalDefenseBonus = currentDefenseBonus + defenseBonusIncrease;

    const defensePower =
      (defensePerTerritoryInf * constants.INFANTRY_POWER +
        defensePerTerritoryTank * constants.TANK_POWER +
        defensePerTerritoryMechInf * constants.MECHANIZED_INFANTRY_POWER +
        defensePerTerritoryArtillery * constants.ARTILLERY_POWER) *
      totalDefenseBonus;

    let combatResult = "",
      attackerLossRate = 0,
      defenderLossRate = 0;

    if (attackPower > defensePower * 1.5) {
      combatResult = "占領";
      attackerLossRate = 0.2;
      defenderLossRate = 0.8;
      await addNews(
        `${attackerNation.name} が ${defenderNation.name} の ${targetCountryName} を占領！`
      );
    } else if (attackPower > defensePower) {
      combatResult = "優勢";
      attackerLossRate = 0.5;
      defenderLossRate = 0.6;
      await addNews(
        `${attackerNation.name} が ${defenderNation.name} の ${targetCountryName} を攻撃（${combatResult}）`
      );
    } else {
      combatResult = "劣勢";
      attackerLossRate = 0.8;
      defenderLossRate = 0.2;
      await addNews(
        `${attackerNation.name} が ${defenderNation.name} の ${targetCountryName} を攻撃（${combatResult}）`
      );
    }

    // 実際の損失計算
    const actualAttackerInfLoss = Math.floor(attackInfantry * attackerLossRate);
    const actualAttackerTankLoss = Math.floor(attackTank * attackerLossRate);
    const actualAttackerMechInfLoss = Math.floor(
      attackMechanizedInfantry * attackerLossRate
    );
    const actualAttackerArtilleryLoss = Math.floor(
      attackArtillery * attackerLossRate
    );

    const defenderInfLoss = Math.floor(
      defensePerTerritoryInf * defenderLossRate
    );
    const defenderTankLoss = Math.floor(
      defensePerTerritoryTank * defenderLossRate
    );
    const defenderMechInfLoss = Math.floor(
      defensePerTerritoryMechInf * defenderLossRate
    );
    const defenderArtilleryLoss = Math.floor(
      defensePerTerritoryArtillery * defenderLossRate
    );

    // 防衛側の部隊を更新
    await Nation.updateOne(
      { owner: updatedDefenderNation.owner },
      {
        $inc: {
          infantry: -defenderInfLoss,
          tank: -defenderTankLoss,
          mechanizedInfantry: -defenderMechInfLoss,
          artillery: -defenderArtilleryLoss,
        },
      }
    );

    // --- 戦勝点計算 ---
    let attackerWarScoreChange = 0;
    let defenderWarScoreChange = 0;

    attackerWarScoreChange += defenderInfLoss * constants.WAR_POINT_INFANTRY;
    attackerWarScoreChange += defenderTankLoss * constants.WAR_POINT_TANK;
    attackerWarScoreChange +=
      defenderMechInfLoss * constants.WAR_POINT_MECHANIZED_INFANTRY;
    attackerWarScoreChange +=
      defenderArtilleryLoss * constants.WAR_POINT_ARTILLERY;

    defenderWarScoreChange +=
      actualAttackerInfLoss * constants.WAR_POINT_INFANTRY;
    defenderWarScoreChange += actualAttackerTankLoss * constants.WAR_POINT_TANK;
    defenderWarScoreChange +=
      actualAttackerMechInfLoss * constants.WAR_POINT_MECHANIZED_INFANTRY;
    defenderWarScoreChange +=
      actualAttackerArtilleryLoss * constants.WAR_POINT_ARTILLERY;

    if (combatResult === "占領") {
      await Nation.updateOne(
        { owner: attackerNation.owner },
        {
          $push: { territories: targetCountryName },
          $inc: { population: 1000 },
        }
      );
      await Nation.updateOne(
        { owner: updatedDefenderNation.owner },
        {
          $pull: { territories: targetCountryName },
          $inc: { population: -1000 },
        }
      );
      attackerWarScoreChange += constants.WAR_POINT_TERRITORY_CAPTURE;
    }

    const scoreUpdate = {};
    if (war.attackerIp === userIp) {
      scoreUpdate.$inc = {
        attackerWarScore: attackerWarScoreChange,
        defenderWarScore: defenderWarScoreChange,
      };
    } else {
      scoreUpdate.$inc = {
        attackerWarScore: defenderWarScoreChange,
        defenderWarScore: attackerWarScoreChange,
      };
    }
    scoreUpdate.$set = { status: "Ongoing" };

    await War.updateOne({ warId: war.warId }, scoreUpdate);

    await removeNationsWithoutTerritories(); // 滅亡国のチェック

    res.json({
      success: true,
      result: combatResult,
      message: `戦闘結果：${combatResult}\n攻撃側損害: 歩兵${actualAttackerInfLoss}, 戦車${actualAttackerTankLoss}, 機械化歩兵${actualAttackerMechInfLoss}, 砲兵${actualAttackerArtilleryLoss}\n防衛側損害: 歩兵${defenderInfLoss}, 戦車${defenderTankLoss}, 機械化歩兵${defenderMechInfLoss}, 砲兵${defenderArtilleryLoss}`,
    });
  } catch (error) {
    console.error("attackTerritory エラー:", error);
    res.status(500).json({
      success: false,
      message: `攻撃中にエラーが発生しました: ${error.message}`,
    });
  } finally {
    await Nation.updateOne(
      { owner: userIp },
      { $set: { invasionStatus: "none" } }
    );
  }
});

// POST /api/bombardTerritory
app.post("/api/bombardTerritory", async (req, res) => {
  const userIp = req.userIp;
  const { targetCountryName, numberOfBombers } = req.body;

  if (!userIp)
    return res
      .status(401)
      .json({ success: false, message: "IPアドレスが取得できません。" });
  if (!targetCountryName || targetCountryName.trim() === "")
    return res
      .status(400)
      .json({ success: false, message: "目標領土名が不正です。" });
  if (isNaN(numberOfBombers) || numberOfBombers <= 0 || numberOfBombers > 100)
    return res.status(400).json({
      success: false,
      message: "爆撃機数は1から100の間で指定してください。(上限: 100機)",
    });

  try {
    let attackerNation = await Nation.findOne({ owner: userIp });
    if (!attackerNation)
      return res
        .status(404)
        .json({ success: false, message: "自国が見つかりません。" });
    if (attackerNation.invasionStatus === "in_progress")
      return res.status(409).json({
        success: false,
        message: "現在、別の攻撃が進行中です。完了するまでお待ちください。",
      });

    await Nation.updateOne(
      { owner: userIp },
      { $set: { invasionStatus: "in_progress" } }
    );

    let defenderNation = await Nation.findOne({
      territories: targetCountryName,
    });
    if (!defenderNation) {
      await Nation.updateOne(
        { owner: userIp },
        { $set: { invasionStatus: "none" } }
      );
      return res
        .status(404)
        .json({ success: false, message: "目標の国が見つかりません。" });
    }
    if (attackerNation.owner === defenderNation.owner) {
      await Nation.updateOne(
        { owner: userIp },
        { $set: { invasionStatus: "none" } }
      );
      return res
        .status(400)
        .json({ success: false, message: "自国を爆撃することはできません。" });
    }

    if (attackerNation.bomber < numberOfBombers) {
      await Nation.updateOne(
        { owner: userIp },
        { $set: { invasionStatus: "none" } }
      );
      return res.status(402).json({
        success: false,
        message: `爆撃機が${numberOfBombers}機足りません。現在${attackerNation.bomber}機所有しています。`,
      });
    }

    // 戦争宣言ロジック
    let war = await War.findOne({
      $or: [
        { attackerIp: userIp, defenderIp: defenderNation.owner },
        { attackerIp: defenderNation.owner, defenderIp: userIp },
      ],
      status: { $nin: ["Ended", "Cancelled"] },
    });

    if (!war) {
      const allTerritoriesData = await Nation.find({})
        .select("territories owner")
        .lean();
      const initialTerritoryOwnershipMap = {};
      allTerritoriesData.forEach((nat) => {
        nat.territories.forEach((t) => {
          initialTerritoryOwnershipMap[t] = nat.owner;
        });
      });
      const newWar = await War.create({
        warId: Date.now().toString(),
        attackerIp: userIp,
        attackerNationName: attackerNation.name,
        defenderIp: defenderNation.owner,
        defenderNationName: defenderNation.name,
        status: "Declared",
        initialTerritoryOwnership: JSON.stringify(initialTerritoryOwnershipMap),
      });
      war = newWar;
      await addNews(
        `${attackerNation.name} が ${defenderNation.name} に宣戦布告しました！`
      );
    }

    const defenderTerritoryCount = defenderNation.territories.length;
    const infInTerritory =
      defenderTerritoryCount > 0
        ? defenderNation.infantry / defenderTerritoryCount
        : 0;
    const tankInTerritory =
      defenderTerritoryCount > 0
        ? defenderNation.tank / defenderTerritoryCount
        : 0;
    const mechInTerritory =
      defenderTerritoryCount > 0
        ? defenderNation.mechanizedInfantry / defenderTerritoryCount
        : 0;
    const artilleryInTerritory =
      defenderTerritoryCount > 0
        ? defenderNation.artillery / defenderTerritoryCount
        : 0;

    if (
      infInTerritory === 0 &&
      tankInTerritory === 0 &&
      mechInTerritory === 0 &&
      artilleryInTerritory === 0
    ) {
      await Nation.updateOne(
        { owner: userIp },
        { $set: { invasionStatus: "none" } }
      );
      return res
        .status(400)
        .json({ success: false, message: "目標領土に防衛部隊がいません。" });
    }

    const effectiveInfantryDestructionRate = Math.min(
      1,
      constants.BOMBER_INFANTRY_DESTRUCTION_RATE * numberOfBombers
    );
    const effectiveTankDestructionRate = Math.min(
      1,
      constants.BOMBER_TANK_DESTRUCTION_RATE * numberOfBombers
    );
    const effectiveMechDestructionRate = Math.min(
      1,
      constants.BOMBER_MECH_DESTRUCTION_RATE * numberOfBombers
    );
    const effectiveArtilleryDestructionRate = Math.min(
      1,
      constants.BOMBER_MECH_DESTRUCTION_RATE * numberOfBombers
    ); // 砲兵も同様に処理

    const infLoss = Math.floor(
      infInTerritory * effectiveInfantryDestructionRate
    );
    const tankLoss = Math.floor(tankInTerritory * effectiveTankDestructionRate);
    const mechInfLoss = Math.floor(
      mechInTerritory * effectiveMechDestructionRate
    );
    const artilleryLoss = Math.floor(
      artilleryInTerritory * effectiveArtilleryDestructionRate
    );

    await Nation.updateOne(
      { owner: defenderNation.owner },
      {
        $inc: {
          infantry: -infLoss,
          tank: -tankLoss,
          mechanizedInfantry: -mechInfLoss,
          artillery: -artilleryLoss,
        },
      }
    );
    await Nation.updateOne(
      { owner: attackerNation.owner },
      { $inc: { bomber: -numberOfBombers } }
    );

    let warPointsGained = 0;
    warPointsGained += infLoss * constants.WAR_POINT_INFANTRY;
    warPointsGained += tankLoss * constants.WAR_POINT_TANK;
    warPointsGained += mechInfLoss * constants.WAR_POINT_MECHANIZED_INFANTRY;
    warPointsGained += artilleryLoss * constants.WAR_POINT_ARTILLERY;
    warPointsGained += numberOfBombers * constants.WAR_POINT_BOMBER;

    // War スコアを更新
    const scoreUpdate = {};
    if (war.attackerIp === userIp) {
      scoreUpdate.$inc = { attackerWarScore: warPointsGained };
    } else {
      scoreUpdate.$inc = { defenderWarScore: warPointsGained };
    }
    scoreUpdate.$set = { status: "Ongoing" };
    await War.updateOne({ warId: war.warId }, scoreUpdate);

    const message = `${attackerNation.name}が${defenderNation.name}の${targetCountryName}に爆撃機を${numberOfBombers}機出撃！ 防衛軍に損害を与えた。(損害: 歩兵${infLoss}, 戦車${tankLoss}, 機械化歩兵${mechInfLoss}, 砲兵${artilleryLoss})`;
    await addNews(message);

    res.json({ success: true, message: message });
  } catch (error) {
    console.error("bombardTerritory エラー:", error);
    res.status(500).json({
      success: false,
      message: `爆撃中にエラーが発生しました: ${error.message}`,
    });
  } finally {
    await Nation.updateOne(
      { owner: userIp },
      { $set: { invasionStatus: "none" } }
    );
  }
});

// POST /api/transferResourcesByName
app.post("/api/transferResourcesByName", async (req, res) => {
  const userIp = req.userIp;
  const { toNationName, type, amount } = req.body;

  if (!userIp)
    return res
      .status(401)
      .json({ success: false, message: "IPアドレスが取得できません。" });
  if (!toNationName || toNationName.trim() === "")
    return res
      .status(400)
      .json({ success: false, message: "相手の国名を入力してください。" });
  const parsedAmount = parseInt(amount, 10);
  if (isNaN(parsedAmount) || parsedAmount <= 0 || parsedAmount > 10000000)
    return res
      .status(400)
      .json({ success: false, message: "正しい数量を入力してください。" });

  try {
    const senderNation = await Nation.findOne({ owner: userIp });
    if (!senderNation)
      return res
        .status(404)
        .json({ success: false, message: "自国が見つかりません。" });
    const receiverNation = await Nation.findOne({ name: toNationName });
    if (!receiverNation)
      return res
        .status(404)
        .json({ success: false, message: "相手の国が見つかりません。" });
    if (senderNation.owner === receiverNation.owner)
      return res
        .status(400)
        .json({ success: false, message: "自国に送ることはできません。" });

    let typeName = "",
      field = "";
    switch (type) {
      case "money":
        typeName = "円";
        field = "money";
        break;
      case "infantry":
        typeName = "歩兵";
        field = "infantry";
        break;
      case "tank":
        typeName = "戦車";
        field = "tank";
        break;
      case "mechanizedInfantry":
        typeName = "機械化歩兵";
        field = "mechanizedInfantry";
        break;
      case "bomber":
        typeName = "爆撃機";
        field = "bomber";
        break;
      case "missile":
        typeName = "ミサイル";
        field = "missile";
        break;
      case "nuclearMissile":
        typeName = "核ミサイル";
        field = "nuclearMissile";
        break;
      case "artillery":
        typeName = "砲兵";
        field = "artillery";
        break;
      case "oil":
        typeName = "石油";
        field = "oil";
        break;
      case "iron":
        typeName = "鉄";
        field = "iron";
        break;
      default:
        return res
          .status(400)
          .json({ success: false, message: "不正なタイプです。" });
    }

    if (senderNation[field] < parsedAmount)
      return res
        .status(402)
        .json({ success: false, message: `${typeName}が足りません。` });

    await Nation.bulkWrite([
      {
        updateOne: {
          filter: { owner: userIp },
          update: { $inc: { [field]: -parsedAmount } },
        },
      },
      {
        updateOne: {
          filter: { owner: receiverNation.owner },
          update: { $inc: { [field]: parsedAmount } },
        },
      },
    ]);

    await addNews(
      `${senderNation.name} が ${receiverNation.name} に ${parsedAmount} ${typeName} を送付`
    );
    res.json({
      success: true,
      message: `${toNationName} に ${parsedAmount} ${typeName} を渡しました。`,
    });
  } catch (error) {
    console.error("transferResourcesByName エラー:", error);
    res
      .status(500)
      .json({ success: false, message: "資源送付中にエラーが発生しました。" });
  }
});

// POST /api/spyNation
app.post("/api/spyNation", async (req, res) => {
  const userIp = req.userIp;
  const { targetNationName } = req.body;

  if (!userIp)
    return res
      .status(401)
      .json({ success: false, message: "IPアドレスが取得できません。" });
  if (!targetNationName || targetNationName.trim() === "")
    return res.status(400).json({
      success: false,
      message: "スパイ対象の国名を入力してください。",
    });

  try {
    const senderNation = await Nation.findOne({ owner: userIp });
    if (!senderNation)
      return res
        .status(404)
        .json({ success: false, message: "あなたの国が見つかりません。" });
    const targetNation = await Nation.findOne({ name: targetNationName });
    if (!targetNation)
      return res
        .status(404)
        .json({ success: false, message: "対象の国が見つかりません。" });
    if (senderNation.owner === targetNation.owner)
      return res
        .status(400)
        .json({ success: false, message: "自国をスパイできません。" });

    if (senderNation.money < 500)
      return res
        .status(402)
        .json({ success: false, message: "お金が足りません（500必要）" });

    await Nation.updateOne({ owner: userIp }, { $inc: { money: -500 } });

    if (Math.random() > 0.5) {
      // 失敗
      await addNews(
        `${senderNation.name} が ${targetNationName} へのスパイに失敗しました。(500円損失)`
      );
      return res.json({
        success: false,
        message: `スパイに失敗しました。500円を失いました。`,
      });
    }

    // 成功
    const getRangeApproximate = (value, rate = 0.2) => {
      const numValue = parseInt(value, 10);
      if (isNaN(numValue)) return "不明";
      return `${Math.floor(numValue * (1 - rate))}~${Math.ceil(
        numValue * (1 + rate)
      )}`;
    };

    res.json({
      success: true,
      message: `${targetNationName} の情報を入手しました。`,
      info: {
        infantry: getRangeApproximate(targetNation.infantry),
        tank: getRangeApproximate(targetNation.tank),
        mechanizedInfantry: getRangeApproximate(
          targetNation.mechanizedInfantry
        ),
        bomber: getRangeApproximate(targetNation.bomber),
        money: getRangeApproximate(targetNation.money),
        missile: getRangeApproximate(targetNation.missile),
        nuclearMissile: getRangeApproximate(targetNation.nuclearMissile),
        artillery: getRangeApproximate(targetNation.artillery),
        oil: getRangeApproximate(targetNation.oil),
        iron: getRangeApproximate(targetNation.iron),
        railways: getRangeApproximate(targetNation.railways),
        shinkansen: getRangeApproximate(targetNation.shinkansen),
        airports: getRangeApproximate(targetNation.airports),
        tourismFacilities: getRangeApproximate(targetNation.tourismFacilities),
      },
    });
  } catch (error) {
    console.error("spyNation エラー:", error);
    res.status(500).json({
      success: false,
      message: "スパイ活動中にエラーが発生しました。",
    });
  }
});

// POST /api/sabotageNation
app.post("/api/sabotageNation", async (req, res) => {
  const userIp = req.userIp;
  const { targetNationName } = req.body;

  if (!userIp)
    return res
      .status(401)
      .json({ success: false, message: "IPアドレスが取得できません。" });
  if (!targetNationName || targetNationName.trim() === "")
    return res.status(400).json({
      success: false,
      message: "破壊工作のターゲット国名を入力してください。",
    });

  try {
    const senderNation = await Nation.findOne({ owner: userIp });
    if (!senderNation)
      return res
        .status(404)
        .json({ success: false, message: "あなたの国が見つかりません。" });
    const targetNation = await Nation.findOne({ name: targetNationName });
    if (!targetNation)
      return res
        .status(404)
        .json({ success: false, message: "対象の国が見つかりません。" });
    if (senderNation.owner === targetNation.owner)
      return res.status(400).json({
        success: false,
        message: "自国に破壊工作を行うことはできません。",
      });

    if (senderNation.money < constants.SABOTAGE_COST)
      return res.status(402).json({
        success: false,
        message: `お金が足りません。(必要: ${constants.SABOTAGE_COST}円)`,
      });

    // コストを差し引く
    await Nation.updateOne(
      { owner: userIp },
      { $inc: { money: -constants.SABOTAGE_COST } }
    );

    let message = "";
    if (Math.random() < constants.SABOTAGE_SUCCESS_CHANCE) {
      // 成功
      const destructionTypes = ["units", "money", "resources", "population"];
      const chosenType =
        destructionTypes[Math.floor(Math.random() * destructionTypes.length)];
      let destructionDetails = "";
      let updateTarget = {};

      switch (chosenType) {
        case "units":
          const unitRate =
            constants.SABOTAGE_UNIT_DESTRUCTION_RATE_MIN +
            Math.random() *
              (constants.SABOTAGE_UNIT_DESTRUCTION_RATE_MAX -
                constants.SABOTAGE_UNIT_DESTRUCTION_RATE_MIN);
          let infLoss = Math.min(
            Math.floor((targetNation.infantry || 0) * unitRate),
            constants.SABOTAGE_MAX_INFANTRY_DESTROYED
          );
          let tankLoss = Math.min(
            Math.floor((targetNation.tank || 0) * unitRate),
            constants.SABOTAGE_MAX_TANK_DESTROYED
          );
          let mechInfLoss = Math.min(
            Math.floor((targetNation.mechanizedInfantry || 0) * unitRate),
            constants.SABOTAGE_MAX_MECHANIZED_INFANTRY_DESTROYED
          );
          let bomberLoss = Math.min(
            Math.floor((targetNation.bomber || 0) * unitRate),
            constants.SABOTAGE_MAX_BOMBER_DESTROYED
          );
          let missileLoss = Math.min(
            Math.floor((targetNation.missile || 0) * unitRate),
            constants.SABOTAGE_MAX_MISSILE_DESTROYED
          );
          let nuclearMissileLoss = Math.min(
            Math.floor((targetNation.nuclearMissile || 0) * unitRate),
            constants.SABOTAGE_MAX_NUCLEAR_MISSILE_DESTROYED
          );
          let artilleryLoss = Math.min(
            Math.floor((targetNation.artillery || 0) * unitRate),
            constants.SABOTAGE_MAX_ARTILLERY_DESTROYED
          );

          updateTarget.$inc = {
            infantry: -infLoss,
            tank: -tankLoss,
            mechanizedInfantry: -mechInfLoss,
            bomber: -bomberLoss,
            missile: -missileLoss,
            nuclearMissile: -nuclearMissileLoss,
            artillery: -artilleryLoss,
          };
          destructionDetails = `兵力に損害を与えた！ (歩兵: ${infLoss}, 戦車: ${tankLoss}, 機械化歩兵: ${mechInfLoss}, 爆撃機: ${bomberLoss}, ミサイル: ${missileLoss}, 核ミサイル: ${nuclearMissileLoss}, 砲兵: ${artilleryLoss})`;
          break;
        case "money":
          const moneyRate =
            constants.SABOTAGE_MONEY_DESTRUCTION_RATE_MIN +
            Math.random() *
              (constants.SABOTAGE_MONEY_DESTRUCTION_RATE_MAX -
                constants.SABOTAGE_MONEY_DESTRUCTION_RATE_MIN);
          let moneyLoss = Math.min(
            Math.floor((targetNation.money || 0) * moneyRate),
            constants.SABOTAGE_MAX_MONEY_DESTROYED
          );
          updateTarget.$inc = { money: -moneyLoss };
          destructionDetails = `資金を強奪した！ (${moneyLoss}円)`;
          break;
        case "resources":
          const resourceRate =
            constants.SABOTAGE_RESOURCE_DESTRUCTION_RATE_MIN +
            Math.random() *
              (constants.SABOTAGE_RESOURCE_DESTRUCTION_RATE_MAX -
                constants.SABOTAGE_RESOURCE_DESTRUCTION_RATE_MIN);
          let oilLoss = Math.min(
            Math.floor((targetNation.oil || 0) * resourceRate),
            constants.SABOTAGE_MAX_OIL_DESTROYED
          );
          let ironLoss = Math.min(
            Math.floor((targetNation.iron || 0) * resourceRate),
            constants.SABOTAGE_MAX_IRON_DESTROYED
          );
          updateTarget.$inc = { oil: -oilLoss, iron: -ironLoss };
          destructionDetails = `資源を破壊した！ (石油: ${oilLoss}, 鉄: ${ironLoss})`;
          break;
        case "population":
          const populationRate =
            constants.SABOTAGE_POPULATION_DESTRUCTION_RATE_MIN +
            Math.random() *
              (constants.SABOTAGE_POPULATION_DESTRUCTION_RATE_MAX -
                constants.SABOTAGE_POPULATION_DESTRUCTION_RATE_MIN);
          let populationLoss = Math.min(
            Math.floor((targetNation.population || 0) * populationRate),
            constants.SABOTAGE_MAX_POPULATION_DESTROYED
          );
          updateTarget.$inc = { population: -populationLoss };
          destructionDetails = `人口に打撃を与えた！ (${populationLoss}人)`;
          break;
      }
      await Nation.updateOne({ _id: targetNation._id }, updateTarget);
      message = `${senderNation.name} が ${targetNationName} への破壊工作に成功しました！ ${destructionDetails}`;
      await addNews(message);
      return res.json({
        success: true,
        message: `破壊工作成功！ ${destructionDetails}`,
      });
    } else {
      // 失敗
      const failureCost =
        constants.SABOTAGE_FAILURE_COST - constants.SABOTAGE_COST;
      const updatedMoney = Math.max(
        0,
        senderNation.money - constants.SABOTAGE_COST - failureCost
      );
      await Nation.updateOne(
        { owner: userIp },
        { $set: { money: updatedMoney } }
      );

      if (updatedMoney === 0) {
        message = `${senderNation.name} が ${targetNationName} への破壊工作に失敗し、全財産を失いました！`;
      } else {
        message = `${senderNation.name} が ${targetNationName} への破壊工作に失敗しました。(追加で${failureCost}円損失)`;
      }
      await addNews(message);
      return res.json({ success: false, message: `破壊工作失敗！ ${message}` });
    }
  } catch (error) {
    console.error("sabotageNation エラー:", error);
    res.status(500).json({
      success: false,
      message: `破壊工作中にエラーが発生しました: ${error.message}`,
    });
  }
});

// POST /api/transferTerritory
app.post("/api/transferTerritory", async (req, res) => {
  const userIp = req.userIp;
  const { territoryName, targetNationName } = req.body;

  if (!userIp)
    return res
      .status(401)
      .json({ success: false, message: "IPアドレスが取得できません。" });
  if (!territoryName || !targetNationName)
    return res
      .status(400)
      .json({ success: false, message: "領土名または相手国名が不正です。" });

  try {
    const senderNation = await Nation.findOne({ owner: userIp });
    if (!senderNation)
      return res
        .status(404)
        .json({ success: false, message: "自国が見つかりません。" });
    const receiverNation = await Nation.findOne({ name: targetNationName });
    if (!receiverNation)
      return res
        .status(404)
        .json({ success: false, message: "相手国が見つかりません。" });
    if (senderNation.owner === receiverNation.owner)
      return res.status(400).json({
        success: false,
        message: "自分の国に譲渡することはできません。",
      });

    if (!senderNation.territories.includes(territoryName))
      return res.status(400).json({
        success: false,
        message: "指定された領土を所有していません。",
      });

    await Nation.bulkWrite([
      {
        updateOne: {
          filter: { owner: senderNation.owner },
          update: {
            $pull: { territories: territoryName },
            $inc: { population: -1000 },
          },
        },
      },
      {
        updateOne: {
          filter: { owner: receiverNation.owner },
          update: {
            $push: { territories: territoryName },
            $inc: { population: 1000 },
          },
        },
      },
    ]);

    await addNews(
      `${senderNation.name}が${receiverNation.name}に領土（${territoryName}）を譲渡しました。`
    );
    res.json({
      success: true,
      message: `${territoryName}を${targetNationName}に譲渡し、人口も1000人移動しました。`,
    });
  } catch (error) {
    console.error("transferTerritory エラー:", error);
    res
      .status(500)
      .json({ success: false, message: "領土譲渡中にエラーが発生しました。" });
  }
});

// POST /api/launchMissile
app.post("/api/launchMissile", async (req, res) => {
  const userIp = req.userIp;
  const { targetCountryName, numberOfMissiles } = req.body;

  if (!userIp)
    return res
      .status(401)
      .json({ success: false, message: "IPアドレスが取得できません。" });
  if (!targetCountryName || targetCountryName.trim() === "")
    return res
      .status(400)
      .json({ success: false, message: "目標領土名が不正です。" });
  if (
    isNaN(numberOfMissiles) ||
    numberOfMissiles <= 0 ||
    numberOfMissiles > 100
  )
    return res.status(400).json({
      success: false,
      message: "ミサイル発射数は1から100の間で指定してください。",
    });

  try {
    let attackerNation = await Nation.findOne({ owner: userIp });
    if (!attackerNation)
      return res
        .status(404)
        .json({ success: false, message: "自国が見つかりません。" });
    if (attackerNation.invasionStatus === "in_progress")
      return res.status(409).json({
        success: false,
        message: "現在、別の攻撃が進行中です。完了するまでお待ちください。",
      });

    await Nation.updateOne(
      { owner: userIp },
      { $set: { invasionStatus: "in_progress" } }
    );

    let defenderNation = await Nation.findOne({
      territories: targetCountryName,
    });
    if (!defenderNation) {
      await Nation.updateOne(
        { owner: userIp },
        { $set: { invasionStatus: "none" } }
      );
      return res
        .status(404)
        .json({ success: false, message: "目標の国が見つかりません。" });
    }
    if (attackerNation.owner === defenderNation.owner) {
      await Nation.updateOne(
        { owner: userIp },
        { $set: { invasionStatus: "none" } }
      );
      return res.status(400).json({
        success: false,
        message: "自国領土にミサイルを発射することはできません。",
      });
    }

    if (attackerNation.missile < numberOfMissiles) {
      await Nation.updateOne(
        { owner: userIp },
        { $set: { invasionStatus: "none" } }
      );
      return res.status(402).json({
        success: false,
        message: `ミサイルが${numberOfMissiles}発足りません。現在${attackerNation.missile}発所有しています。`,
      });
    }

    // 戦争宣言ロジック (存在しない場合)
    let war = await War.findOne({
      $or: [
        { attackerIp: userIp, defenderIp: defenderNation.owner },
        { attackerIp: defenderNation.owner, defenderIp: userIp },
      ],
      status: { $nin: ["Ended", "Cancelled"] },
    });

    if (!war) {
      const allTerritoriesData = await Nation.find({})
        .select("territories owner")
        .lean();
      const initialTerritoryOwnershipMap = {};
      allTerritoriesData.forEach((nat) => {
        nat.territories.forEach((t) => {
          initialTerritoryOwnershipMap[t] = nat.owner;
        });
      });
      const newWar = await War.create({
        warId: Date.now().toString(),
        attackerIp: userIp,
        attackerNationName: attackerNation.name,
        defenderIp: defenderNation.owner,
        defenderNationName: defenderNation.name,
        status: "Declared",
        initialTerritoryOwnership: JSON.stringify(initialTerritoryOwnershipMap),
      });
      war = newWar;
      await addNews(
        `${attackerNation.name} が ${defenderNation.name} に宣戦布告しました！`
      );
    }

    await Nation.updateOne(
      { owner: attackerNation.owner },
      { $inc: { missile: -numberOfMissiles } }
    );

    const defenderTerritoryCount = defenderNation.territories.length;
    const infInTerritory =
      defenderTerritoryCount > 0
        ? defenderNation.infantry / defenderTerritoryCount
        : 0;
    const tankInTerritory =
      defenderTerritoryCount > 0
        ? defenderNation.tank / defenderTerritoryCount
        : 0;
    const mechInTerritory =
      defenderTerritoryCount > 0
        ? defenderNation.mechanizedInfantry / defenderTerritoryCount
        : 0;
    const artilleryInTerritory =
      defenderTerritoryCount > 0
        ? defenderNation.artillery / defenderTerritoryCount
        : 0;

    const populationLossPerMissile = 3000;
    const totalPopulationLoss = populationLossPerMissile * numberOfMissiles;
    const destructionRatePerMissile = 0.5;
    const totalDestructionRate = Math.min(
      1,
      destructionRatePerMissile * numberOfMissiles
    );

    const infLoss = Math.floor(infInTerritory * totalDestructionRate);
    const tankLoss = Math.floor(tankInTerritory * totalDestructionRate);
    const mechInfLoss = Math.floor(mechInTerritory * totalDestructionRate);
    const artilleryLoss = Math.floor(
      artilleryInTerritory * totalDestructionRate
    );

    await Nation.updateOne(
      { owner: defenderNation.owner },
      {
        $inc: {
          population: -totalPopulationLoss,
          infantry: -infLoss,
          tank: -tankLoss,
          mechanizedInfantry: -mechInfLoss,
          artillery: -artilleryLoss,
        },
      }
    );

    let warPointsGained = 0;
    warPointsGained += infLoss * constants.WAR_POINT_INFANTRY;
    warPointsGained += tankLoss * constants.WAR_POINT_TANK;
    warPointsGained += mechInfLoss * constants.WAR_POINT_MECHANIZED_INFANTRY;
    warPointsGained += artilleryLoss * constants.WAR_POINT_ARTILLERY;
    warPointsGained += numberOfMissiles * constants.WAR_POINT_MISSILE;

    const scoreUpdate = {};
    if (war.attackerIp === userIp) {
      scoreUpdate.$inc = { attackerWarScore: warPointsGained };
    } else {
      scoreUpdate.$inc = { defenderWarScore: warPointsGained };
    }
    scoreUpdate.$set = { status: "Ongoing" };
    await War.updateOne({ warId: war.warId }, scoreUpdate);

    await addNews(
      `${attackerNation.name}が${defenderNation.name}の${targetCountryName}にミサイルを${numberOfMissiles}発発射！`
    );
    await addNews(
      `${defenderNation.name}の${targetCountryName}にミサイルが着弾！ 人口${totalPopulationLoss}減少し、防衛軍が壊滅した。(損害: 歩兵${infLoss}, 戦車${tankLoss}, 機械化歩兵${mechInfLoss}, 砲兵${artilleryLoss})`
    );

    res.json({
      success: true,
      message: `ミサイルが${targetCountryName}に${numberOfMissiles}発発射されました。着弾します。`,
    });
  } catch (error) {
    console.error("launchMissile エラー:", error);
    res.status(500).json({
      success: false,
      message: `ミサイル発射中にエラーが発生しました: ${error.message}`,
    });
  } finally {
    await Nation.updateOne(
      { owner: userIp },
      { $set: { invasionStatus: "none" } }
    );
  }
});

// POST /api/launchNuclearMissile
app.post("/api/launchNuclearMissile", async (req, res) => {
  const userIp = req.userIp;
  const { targetCountryName, numberOfMissiles } = req.body;

  if (!userIp)
    return res
      .status(401)
      .json({ success: false, message: "IPアドレスが取得できません。" });
  if (!targetCountryName || targetCountryName.trim() === "")
    return res
      .status(400)
      .json({ success: false, message: "目標領土名が不正です。" });
  if (isNaN(numberOfMissiles) || numberOfMissiles <= 0 || numberOfMissiles > 5)
    return res.status(400).json({
      success: false,
      message: "核ミサイル発射数は1から5の間で指定してください。",
    });

  try {
    let attackerNation = await Nation.findOne({ owner: userIp });
    if (!attackerNation)
      return res
        .status(404)
        .json({ success: false, message: "自国が見つかりません。" });
    if (attackerNation.invasionStatus === "in_progress")
      return res.status(409).json({
        success: false,
        message: "現在、別の攻撃が進行中です。完了するまでお待ちください。",
      });

    if (
      !attackerNation.completedFocuses.includes("nuclear_weapons_development")
    ) {
      return res.status(403).json({
        success: false,
        message: "核兵器開発の国家方針を完了していません。",
      });
    }

    await Nation.updateOne(
      { owner: userIp },
      { $set: { invasionStatus: "in_progress" } }
    );

    let defenderNation = await Nation.findOne({
      territories: targetCountryName,
    });
    if (!defenderNation) {
      await Nation.updateOne(
        { owner: userIp },
        { $set: { invasionStatus: "none" } }
      );
      return res
        .status(404)
        .json({ success: false, message: "目標の国が見つかりません。" });
    }
    if (attackerNation.owner === defenderNation.owner) {
      await Nation.updateOne(
        { owner: userIp },
        { $set: { invasionStatus: "none" } }
      );
      return res.status(400).json({
        success: false,
        message: "自国領土に核ミサイルを発射することはできません。",
      });
    }

    if (attackerNation.nuclearMissile < numberOfMissiles) {
      await Nation.updateOne(
        { owner: userIp },
        { $set: { invasionStatus: "none" } }
      );
      return res.status(402).json({
        success: false,
        message: `核ミサイルが${numberOfMissiles}発足りません。現在${attackerNation.nuclearMissile}発所有しています。`,
      });
    }

    // 戦争宣言ロジック (存在しない場合)
    let war = await War.findOne({
      $or: [
        { attackerIp: userIp, defenderIp: defenderNation.owner },
        { attackerIp: defenderNation.owner, defenderIp: userIp },
      ],
      status: { $nin: ["Ended", "Cancelled"] },
    });

    if (!war) {
      const allTerritoriesData = await Nation.find({})
        .select("territories owner")
        .lean();
      const initialTerritoryOwnershipMap = {};
      allTerritoriesData.forEach((nat) => {
        nat.territories.forEach((t) => {
          initialTerritoryOwnershipMap[t] = nat.owner;
        });
      });
      const newWar = await War.create({
        warId: Date.now().toString(),
        attackerIp: userIp,
        attackerNationName: attackerNation.name,
        defenderIp: defenderNation.owner,
        defenderNationName: defenderNation.name,
        status: "Declared",
        initialTerritoryOwnership: JSON.stringify(initialTerritoryOwnershipMap),
      });
      war = newWar;
      await addNews(
        `${attackerNation.name} が ${defenderNation.name} に宣戦布告しました！`
      );
    }

    await Nation.updateOne(
      { owner: attackerNation.owner },
      { $inc: { nuclearMissile: -numberOfMissiles } }
    );

    const totalPopulationLoss =
      constants.NUCLEAR_MISSILE_POP_DESTRUCTION_PER_MISSILE * numberOfMissiles;
    const totalDestructionRate = Math.min(
      1,
      constants.NUCLEAR_MISSILE_UNIT_DESTRUCTION_RATE * numberOfMissiles
    );

    const infLoss = Math.floor(
      (defenderNation.infantry || 0) * totalDestructionRate
    );
    const tankLoss = Math.floor(
      (defenderNation.tank || 0) * totalDestructionRate
    );
    const mechInfLoss = Math.floor(
      (defenderNation.mechanizedInfantry || 0) * totalDestructionRate
    );
    const bomberLoss = Math.floor(
      (defenderNation.bomber || 0) * totalDestructionRate
    );
    const missileLoss = Math.floor(
      (defenderNation.missile || 0) * totalDestructionRate
    );
    const artilleryLoss = Math.floor(
      (defenderNation.artillery || 0) * totalDestructionRate
    );

    await Nation.updateOne(
      { owner: defenderNation.owner },
      {
        $inc: {
          population: -totalPopulationLoss,
          infantry: -infLoss,
          tank: -tankLoss,
          mechanizedInfantry: -mechInfLoss,
          bomber: -bomberLoss,
          missile: -missileLoss,
          artillery: -artilleryLoss,
        },
      }
    );

    let warPointsGained = 0;
    warPointsGained += infLoss * constants.WAR_POINT_INFANTRY;
    warPointsGained += tankLoss * constants.WAR_POINT_TANK;
    warPointsGained += mechInfLoss * constants.WAR_POINT_MECHANIZED_INFANTRY;
    warPointsGained += bomberLoss * constants.WAR_POINT_BOMBER;
    warPointsGained += missileLoss * constants.WAR_POINT_MISSILE;
    warPointsGained += artilleryLoss * constants.WAR_POINT_ARTILLERY;
    warPointsGained += numberOfMissiles * constants.WAR_POINT_NUCLEAR_MISSILE;

    const scoreUpdate = {};
    if (war.attackerIp === userIp) {
      scoreUpdate.$inc = { attackerWarScore: warPointsGained };
    } else {
      scoreUpdate.$inc = { defenderWarScore: warPointsGained };
    }
    scoreUpdate.$set = { status: "Ongoing" };
    await War.updateOne({ warId: war.warId }, scoreUpdate);

    await addNews(
      `${attackerNation.name}が${defenderNation.name}の${targetCountryName}に核ミサイルを${numberOfMissiles}発発射！`
    );
    await addNews(
      `${defenderNation.name}の${targetCountryName}に核ミサイルが着弾！ 人口${totalPopulationLoss}減少し、防衛軍が壊滅した。(損害: 歩兵${infLoss}, 戦車${tankLoss}, 機械化歩兵${mechInfLoss}, 爆撃機${bomberLoss}, ミサイル${missileLoss}, 砲兵${artilleryLoss})`
    );

    await removeNationsWithoutTerritories();

    res.json({
      success: true,
      message: `核ミサイルが${targetCountryName}に${numberOfMissiles}発発射されました。着弾します。`,
    });
  } catch (error) {
    console.error("launchNuclearMissile エラー:", error);
    res.status(500).json({
      success: false,
      message: `核ミサイル発射中にエラーが発生しました: ${error.message}`,
    });
  } finally {
    await Nation.updateOne(
      { owner: userIp },
      { $set: { invasionStatus: "none" } }
    );
  }
});

// GET /api/chatMessages
app.get("/api/chatMessages", async (req, res) => {
  try {
    const messages = await ChatLog.find({}).sort({ timestamp: -1 }).limit(30);
    const formattedMessages = messages.reverse().map((msg) => ({
      time: format(msg.timestamp, "HH:mm"),
      userIp: msg.userIp,
      nationName: msg.nationName,
      selectedTitleId: msg.selectedTitleId,
      flagUrl: msg.flagUrl,
      message: msg.message,
    }));
    res.json(formattedMessages);
  } catch (error) {
    console.error("getChatMessages エラー:", error);
    res.status(500).json({
      success: false,
      message: "チャットログの取得中にエラーが発生しました。",
    });
  }
});

// POST /api/postChatMessage
app.post("/api/postChatMessage", async (req, res) => {
  const userIp = req.userIp;
  const { message } = req.body;

  if (!userIp)
    return res
      .status(401)
      .json({ success: false, message: "IPアドレスが取得できません。" });
  if (!message || message.trim() === "") {
    return res
      .status(400)
      .json({ success: false, message: "無効なメッセージです。" });
  }
  const trimmedMessage = message.trim();
  if (trimmedMessage.length > 200) {
    return res.status(400).json({
      success: false,
      message: "メッセージが長すぎます。(200文字まで)",
    });
  }

  try {
    const userNation = await Nation.findOne({ owner: userIp });
    const nationName = userNation ? userNation.name : "不明な国";
    const selectedTitleId = userNation ? userNation.selectedTitleId : "";
    const flagUrl = userNation ? userNation.flagUrl : "";

    await ChatLog.create({
      userIp,
      nationName,
      selectedTitleId,
      flagUrl,
      message: trimmedMessage,
    });
    res.json({ success: true });
  } catch (error) {
    console.error("postChatMessage エラー:", error);
    res.status(500).json({
      success: false,
      message: "チャットメッセージの投稿中にエラーが発生しました。",
    });
  }
});

// GET /api/getAvailableNationalFocuses
app.get("/api/getAvailableNationalFocuses", async (req, res) => {
  const userIp = req.userIp;
  if (!userIp)
    return res.status(401).json({
      success: false,
      message: "IPアドレスが取得できません。",
      focuses: [],
    });

  try {
    const userNation = await Nation.findOne({ owner: userIp });
    if (!userNation)
      return res.status(404).json({
        success: false,
        message: "あなたの国が見つかりません。",
        focuses: [],
      });

    if (userNation.activeFocusId) {
      const activeFocus = NATIONAL_FOCUSES[userNation.activeFocusId];
      return res.json({
        success: true,
        message: "すでに国家方針を実行中です。",
        focuses: [],
        activeFocus: {
          ...activeFocus,
          turnsRemaining: userNation.focusTurnsRemaining,
        },
      });
    }

    const availableFocuses = [];
    for (const id in NATIONAL_FOCUSES) {
      const focus = NATIONAL_FOCUSES[id];
      if (userNation.completedFocuses.includes(id)) continue;

      const hasPrerequisites = focus.prerequisites.every((prereqId) =>
        userNation.completedFocuses.includes(prereqId)
      );
      if (!hasPrerequisites) continue;

      const isExclusive = focus.exclusiveWith.some((exclusiveId) =>
        userNation.completedFocuses.includes(exclusiveId)
      );
      if (isExclusive) continue;

      availableFocuses.push({ id: id, ...focus });
    }
    res.json({ success: true, focuses: availableFocuses, activeFocus: null });
  } catch (error) {
    console.error("getAvailableNationalFocuses エラー:", error);
    res.status(500).json({
      success: false,
      message: "利用可能な国家方針の取得中にエラーが発生しました。",
      focuses: [],
    });
  }
});

// POST /api/startNationalFocus
app.post("/api/startNationalFocus", async (req, res) => {
  const userIp = req.userIp;
  const { focusId } = req.body;

  if (!userIp)
    return res
      .status(401)
      .json({ success: false, message: "IPアドレスが取得できません。" });
  const focus = NATIONAL_FOCUSES[focusId];
  if (!focus)
    return res
      .status(400)
      .json({ success: false, message: "無効な国家方針です。" });

  try {
    const userNation = await Nation.findOne({ owner: userIp });
    if (!userNation)
      return res
        .status(404)
        .json({ success: false, message: "あなたの国が見つかりません。" });
    if (userNation.activeFocusId)
      return res
        .status(409)
        .json({ success: false, message: "すでに国家方針を実行中です。" });
    if (userNation.completedFocuses.includes(focusId))
      return res.status(409).json({
        success: false,
        message: "この国家方針はすでに完了しています。",
      });

    const hasPrerequisites = focus.prerequisites.every((prereqId) =>
      userNation.completedFocuses.includes(prereqId)
    );
    if (!hasPrerequisites)
      return res
        .status(403)
        .json({ success: false, message: "前提条件が満たされていません。" });
    const isExclusive = focus.exclusiveWith.some((exclusiveId) =>
      userNation.completedFocuses.includes(exclusiveId)
    );
    if (isExclusive)
      return res.status(403).json({
        success: false,
        message: "排他的な国家方針がすでに完了しています。",
      });

    await Nation.updateOne(
      { owner: userIp },
      { $set: { activeFocusId: focusId, focusTurnsRemaining: focus.costTurns } }
    );

    await addNews(
      `${userNation.name} が国家方針「${focus.name}」を開始しました。`
    );
    res.json({
      success: true,
      message: `国家方針「${focus.name}」を開始しました。`,
    });
  } catch (error) {
    console.error("startNationalFocus エラー:", error);
    res.status(500).json({
      success: false,
      message: "国家方針の開始中にエラーが発生しました。",
    });
  }
});

// POST /api/resetNationalFocus (Test-only)
app.post("/api/resetNationalFocus", async (req, res) => {
  const userIp = req.userIp;
  if (!userIp)
    return res
      .status(401)
      .json({ success: false, message: "IPアドレスが取得できません。" });

  try {
    const userNation = await Nation.findOne({ owner: userIp });
    if (!userNation)
      return res
        .status(404)
        .json({ success: false, message: "あなたの国が見つかりません。" });

    await Nation.updateOne(
      { owner: userIp },
      {
        $set: {
          activeFocusId: "",
          focusTurnsRemaining: 0,
          completedFocuses: [],
        },
      }
    );

    await addNews(
      `${userNation.name} の国家方針がリセットされました。(テスト用)`
    );
    res.json({ success: true, message: "国家方針がリセットされました。" });
  } catch (error) {
    console.error("resetNationalFocus エラー:", error);
    res.status(500).json({
      success: false,
      message: "国家方針のリセット中にエラーが発生しました。",
    });
  }
});

// GET /api/getTerritoryRanking
app.get("/api/getTerritoryRanking", async (req, res) => {
  try {
    const nations = await Nation.find({});
    const ranking = nations.map((n) => ({
      name: n.name,
      territories: n.territories.length,
      selectedTitleId: n.selectedTitleId,
      flagUrl: n.flagUrl,
    }));
    ranking.sort((a, b) => b.territories - a.territories);
    res.json(ranking);
  } catch (error) {
    console.error("getTerritoryRanking エラー:", error);
    res.status(500).json({
      success: false,
      message: "領土ランキングの取得中にエラーが発生しました。",
    });
  }
});

// POST /api/updateNationInfo
app.post("/api/updateNationInfo", async (req, res) => {
  const userIp = req.userIp;
  const { newName, newColor } = req.body;

  if (!userIp)
    return res
      .status(401)
      .json({ success: false, message: "IPアドレスが取得できません。" });

  try {
    const userNation = await Nation.findOne({ owner: userIp });
    if (!userNation)
      return res
        .status(404)
        .json({ success: false, message: "あなたの国が見つかりません。" });

    let updatePerformed = false;
    const message = [];
    const updateFields = {};

    if (newName && newName.trim() !== userNation.name) {
      if (await Nation.findOne({ name: newName.trim() }))
        return res.status(409).json({
          success: false,
          message: `国名「${newName.trim()}」はすでに使用されています。`,
        });
      updateFields.name = newName.trim();
      message.push(`国名を「${newName.trim()}」に変更しました。`);
      await addNews(
        `${userNation.name} が国名を ${newName.trim()} に変更しました。`
      );
      updatePerformed = true;
    }

    if (newColor && newColor !== userNation.color) {
      if (!/^#[0-9A-Fa-f]{6}$/.test(newColor))
        return res.status(400).json({
          success: false,
          message: "無効な色コードです。#RRGGBB形式で入力してください。",
        });
      updateFields.color = newColor;
      message.push(`国の色を「${newColor}」に変更しました。`);
      await addNews(
        `${userNation.name} が国の色を ${newColor} に変更しました。`
      );
      updatePerformed = true;
    }

    if (updatePerformed) {
      await Nation.updateOne({ owner: userIp }, { $set: updateFields });
      await ChatLog.updateMany(
        { userIp },
        { $set: { nationName: updateFields.name || userNation.name } }
      ); // チャットログの国名も更新
      await UserActivity.updateOne(
        { userIp },
        { $set: { nationName: updateFields.name || userNation.name } }
      ); // アクティビティログの国名も更新

      res.json({ success: true, message: message.join(" ") });
    } else {
      res.json({ success: false, message: "変更する情報がありませんでした。" });
    }
  } catch (error) {
    console.error("updateNationInfo エラー:", error);
    res.status(500).json({
      success: false,
      message: "国の情報更新中にエラーが発生しました。",
    });
  }
});

// POST /api/updateNationFlag
app.post("/api/updateNationFlag", async (req, res) => {
  const userIp = req.userIp;
  const { newFlagUrl } = req.body;

  if (!userIp)
    return res
      .status(401)
      .json({ success: false, message: "IPアドレスが取得できません。" });
  // URLまたはBase64の簡単なバリデーション
  if (
    newFlagUrl &&
    !/^https?:\/\/.+\.(png|jpg|jpeg|gif|svg)$/i.test(newFlagUrl) &&
    !newFlagUrl.startsWith("data:image/")
  ) {
    return res.status(400).json({
      success: false,
      message:
        "無効なURL形式です。画像URL (png, jpg, gif, svg) またはBase64データURLを入力してください。",
    });
  }

  try {
    const userNation = await Nation.findOne({ owner: userIp });
    if (!userNation)
      return res
        .status(404)
        .json({ success: false, message: "あなたの国が見つかりません。" });

    await Nation.updateOne(
      { owner: userIp },
      { $set: { flagUrl: newFlagUrl } }
    );
    await ChatLog.updateMany({ userIp }, { $set: { flagUrl: newFlagUrl } }); // チャットログの国旗も更新

    await addNews(`${userNation.name} が国旗を変更しました。`);
    res.json({ success: true, message: `国旗を更新しました。` });
  } catch (error) {
    console.error("updateNationFlag エラー:", error);
    res.status(500).json({
      success: false,
      message: "国旗の更新中にエラーが発生しました。",
    });
  }
});

// POST /api/attemptRebellion
app.post("/api/attemptRebellion", async (req, res) => {
  const userIp = req.userIp;
  const { targetCountryName } = req.body;

  if (!userIp)
    return res
      .status(401)
      .json({ success: false, message: "IPアドレスが取得できません。" });
  if (!targetCountryName || targetCountryName.trim() === "")
    return res.status(400).json({
      success: false,
      message: "反乱を起こす領土名を入力してください。",
    });

  try {
    const userNation = await Nation.findOne({ owner: userIp });
    if (userNation && userNation.territories.length > 0)
      return res.status(403).json({
        success: false,
        message:
          "あなたはすでに国を所有しています。反乱を起こすことはできません。",
      });

    let userActivity = await UserActivity.findOne({ userIp });
    let rebellionCount = userActivity ? userActivity.rebellionCount : 0;
    if (rebellionCount >= constants.MAX_REBELLIONS)
      return res.status(403).json({
        success: false,
        message: `反乱は${constants.MAX_REBELLIONS}回までしか起こせません。あなたはすでに${rebellionCount}回反乱を起こしています。`,
      });

    const targetNation = await Nation.findOne({
      territories: targetCountryName,
    });
    if (!targetNation)
      return res.status(404).json({
        success: false,
        message: "指定された領土は存在しないか、未所属です。",
      });
    if (targetNation.owner === userIp)
      return res.status(400).json({
        success: false,
        message: "自分の領土に対して反乱を起こすことはできません。",
      });
    if (targetNation.territories.length === 0)
      return res.status(400).json({
        success: false,
        message: "ターゲットの国は領土がありません。",
      });

    const totalTerritoriesOfTarget = targetNation.territories.length;
    const perTerritoryShareMoney =
      targetNation.money / totalTerritoriesOfTarget;
    const perTerritoryShareOil = targetNation.oil / totalTerritoriesOfTarget;
    const perTerritoryShareIron = targetNation.iron / totalTerritoriesOfTarget;
    const perTerritoryShareInfantry =
      targetNation.infantry / totalTerritoriesOfTarget;
    const perTerritoryShareTank = targetNation.tank / totalTerritoriesOfTarget;
    const perTerritoryShareMechanizedInfantry =
      targetNation.mechanizedInfantry / totalTerritoriesOfTarget;
    const perTerritoryShareBomber =
      targetNation.bomber / totalTerritoriesOfTarget;
    const perTerritoryShareMissile =
      targetNation.missile / totalTerritoriesOfTarget;
    const perTerritoryShareNuclearMissile =
      targetNation.nuclearMissile / totalTerritoriesOfTarget;
    const perTerritoryShareArtillery =
      targetNation.artillery / totalTerritoriesOfTarget;
    const perTerritorySharePopulation =
      targetNation.population / totalTerritoriesOfTarget;

    const initialMoney = Math.floor(
      perTerritoryShareMoney * constants.REBELLION_RESOURCE_FACTOR
    );
    const initialOil = Math.floor(
      perTerritoryShareOil * constants.REBELLION_RESOURCE_FACTOR
    );
    const initialIron = Math.floor(
      perTerritoryShareIron * constants.REBELLION_RESOURCE_FACTOR
    );
    const initialInfantry = Math.floor(
      perTerritoryShareInfantry * constants.REBELLION_RESOURCE_FACTOR
    );
    const initialTank = Math.floor(
      perTerritoryShareTank * constants.REBELLION_RESOURCE_FACTOR
    );
    const initialMechanizedInfantry = Math.floor(
      perTerritoryShareMechanizedInfantry * constants.REBELLION_RESOURCE_FACTOR
    );
    const initialBomber = Math.floor(
      perTerritoryShareBomber * constants.REBELLION_RESOURCE_FACTOR
    );
    const initialMissile = Math.floor(
      perTerritoryShareMissile * constants.REBELLION_RESOURCE_FACTOR
    );
    const initialNuclearMissile = Math.floor(
      perTerritoryShareNuclearMissile * constants.REBELLION_RESOURCE_FACTOR
    );
    const initialArtillery = Math.floor(
      perTerritoryShareArtillery * constants.REBELLION_RESOURCE_FACTOR
    );
    const initialPopulation = Math.floor(
      perTerritorySharePopulation * constants.REBELLION_POPULATION_FACTOR
    );

    const finalMoney = Math.max(initialMoney, constants.MIN_STARTING_MONEY);
    const finalPopulation = Math.max(
      initialPopulation,
      constants.MIN_STARTING_POPULATION
    );
    const finalInfantry = Math.max(
      initialInfantry,
      constants.MIN_STARTING_INFANTRY
    );

    const id = Date.now();
    const color =
      "#" +
      Math.floor(Math.random() * 16777215)
        .toString(16)
        .padStart(6, "0");
    const rebelNationName = `${targetCountryName}反乱軍`;

    await Nation.create({
      originalId: id,
      name: rebelNationName,
      color: color,
      infantry: finalInfantry,
      tank: initialTank,
      mechanizedInfantry: initialMechanizedInfantry,
      bomber: initialBomber,
      money: finalMoney,
      population: finalPopulation,
      territories: [targetCountryName],
      owner: userIp,
      missile: initialMissile,
      oil: initialOil,
      iron: initialIron,
      nuclearMissile: initialNuclearMissile,
      artillery: initialArtillery,
      acquiredTitles: ["president"],
      selectedTitleId: "president",
    });

    await Nation.updateOne(
      { _id: targetNation._id },
      {
        $pull: { territories: targetCountryName },
        $inc: {
          money: -finalMoney,
          oil: -initialOil,
          iron: -initialIron,
          infantry: -finalInfantry,
          tank: -initialTank,
          mechanizedInfantry: -initialMechanizedInfantry,
          bomber: -initialBomber,
          missile: -initialMissile,
          nuclearMissile: -initialNuclearMissile,
          artillery: -initialArtillery,
          population: -finalPopulation,
        },
      }
    );

    await UserActivity.findOneAndUpdate(
      { userIp },
      { $inc: { rebellionCount: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await addNews(
      `${rebelNationName} が ${targetNation.name} の領土 ${targetCountryName} で反乱を起こし、建国しました！`
    );
    await removeNationsWithoutTerritories();

    res.json({
      success: true,
      message: `${targetCountryName} で反乱に成功し、${rebelNationName} を建国しました！`,
    });
  } catch (error) {
    console.error("attemptRebellion エラー:", error);
    res.status(500).json({
      success: false,
      message: `反乱中にエラーが発生しました: ${error.message}`,
    });
  }
});

// War System Endpoints
// POST /api/declareWar
app.post("/api/declareWar", async (req, res) => {
  const userIp = req.userIp;
  const { targetNationName } = req.body;

  if (!userIp)
    return res
      .status(401)
      .json({ success: false, message: "IPアドレスが取得できません。" });
  if (!targetNationName || targetNationName.trim() === "")
    return res.status(400).json({
      success: false,
      message: "宣戦布告先の国名を入力してください。",
    });

  try {
    const attackerNation = await Nation.findOne({ owner: userIp });
    if (!attackerNation)
      return res
        .status(404)
        .json({ success: false, message: "あなたの国が見つかりません。" });
    const defenderNation = await Nation.findOne({ name: targetNationName });
    if (!defenderNation)
      return res
        .status(404)
        .json({ success: false, message: "宣戦布告先の国が見つかりません。" });
    if (attackerNation.owner === defenderNation.owner)
      return res.status(400).json({
        success: false,
        message: "自分自身に宣戦布告することはできません。",
      });

    if (
      await War.findOne({
        $or: [
          { attackerIp: userIp, defenderIp: defenderNation.owner },
          { attackerIp: defenderNation.owner, defenderIp: userIp },
        ],
        status: { $nin: ["Ended", "Cancelled"] },
      })
    ) {
      return res.status(409).json({
        success: false,
        message: `${defenderNation.name}とはすでに戦争中です。`,
      });
    }
    if (
      await Alliance.findOne({
        $or: [
          {
            requesterIp: userIp,
            approverIp: defenderNation.owner,
            status: "Approved",
          },
          {
            requesterIp: defenderNation.owner,
            approverIp: userIp,
            status: "Approved",
          },
        ],
      })
    ) {
      return res.status(403).json({
        success: false,
        message: `${defenderNation.name}はあなたの同盟国です。同盟国に宣戦布告することはできません。`,
      });
    }

    const allTerritoriesData = await Nation.find({})
      .select("territories owner")
      .lean();
    const initialTerritoryOwnershipMap = {};
    allTerritoriesData.forEach((nat) => {
      nat.territories.forEach((t) => {
        initialTerritoryOwnershipMap[t] = nat.owner;
      });
    });

    await War.create({
      warId: Date.now().toString(),
      attackerIp: attackerNation.owner,
      attackerNationName: attackerNation.name,
      defenderIp: defenderNation.owner,
      defenderNationName: defenderNation.name,
      status: "Declared",
      initialTerritoryOwnership: JSON.stringify(initialTerritoryOwnershipMap),
    });

    await addNews(
      `${attackerNation.name} が ${defenderNation.name} に宣戦布告しました！`
    );
    res.json({
      success: true,
      message: `${defenderNation.name} に宣戦布告しました。`,
    });
  } catch (error) {
    console.error("declareWar エラー:", error);
    res
      .status(500)
      .json({ success: false, message: "宣戦布告中にエラーが発生しました。" });
  }
});

// GET /api/getUserWars
app.get("/api/getUserWars", async (req, res) => {
  const userIp = req.userIp;
  if (!userIp)
    return res.status(401).json({
      activeWars: [],
      ceasefireProposals: [],
      whitePeaceProposals: [],
      message: "IPアドレスが取得できません。",
    });

  try {
    const allWars = await War.find({
      $or: [{ attackerIp: userIp }, { defenderIp: userIp }],
      status: { $nin: ["Ended", "Cancelled"] },
    });

    const activeWars = [];
    const ceasefireProposals = [];
    const whitePeaceProposals = [];

    allWars.forEach((war) => {
      activeWars.push(war);
      const otherPartyIp =
        war.attackerIp === userIp ? war.defenderIp : war.attackerIp;

      if (war.ceasefireProposedBy === otherPartyIp) {
        if (war.status === constants.WAR_STATUS_WHITE_PEACE_PROPOSED) {
          whitePeaceProposals.push(war);
        } else if (war.status === "Declared" || war.status === "Ongoing") {
          ceasefireProposals.push(war);
        }
      }
    });

    res.json({ activeWars, ceasefireProposals, whitePeaceProposals });
  } catch (error) {
    console.error("getUserWars エラー:", error);
    res.status(500).json({
      activeWars: [],
      ceasefireProposals: [],
      whitePeaceProposals: [],
      message: "戦争情報の取得中にエラーが発生しました。",
    });
  }
});

// POST /api/proposeCeasefire
app.post("/api/proposeCeasefire", async (req, res) => {
  const userIp = req.userIp;
  const { warId } = req.body;

  if (!userIp)
    return res
      .status(401)
      .json({ success: false, message: "IPアドレスが取得できません。" });
  if (!warId)
    return res
      .status(400)
      .json({ success: false, message: "戦争IDが不正です。" });

  try {
    const war = await War.findOne({ warId });
    if (!war)
      return res
        .status(404)
        .json({ success: false, message: "戦争が見つかりません。" });
    if (war.attackerIp !== userIp && war.defenderIp !== userIp)
      return res.status(403).json({
        success: false,
        message: "あなたはこの戦争の参加者ではありません。",
      });
    if (
      war.status === "Ceasefire" ||
      war.status === "Ended" ||
      war.status === "Cancelled" ||
      war.status === constants.WAR_STATUS_WHITE_PEACE_PROPOSED
    ) {
      return res.status(400).json({
        success: false,
        message: "この戦争は停戦を提案できる状態ではありません。",
      });
    }
    if (war.ceasefireProposedBy === userIp)
      return res
        .status(409)
        .json({ success: false, message: "すでに停戦を提案済みです。" });

    await War.updateOne({ warId }, { $set: { ceasefireProposedBy: userIp } });

    const myNationName = (await getNationInfoByIp(userIp)).name;
    const otherPartyIp =
      war.attackerIp === userIp ? war.defenderIp : war.attackerIp;
    const otherNationName = (await getNationInfoByIp(otherPartyIp)).name;

    await addNews(
      `${myNationName} が ${otherNationName} に停戦を提案しました。`
    );
    res.json({
      success: true,
      message: `${otherNationName} に停戦を提案しました。相手の承認を待っています。`,
    });
  } catch (error) {
    console.error("proposeCeasefire エラー:", error);
    res
      .status(500)
      .json({ success: false, message: "停戦提案中にエラーが発生しました。" });
  }
});

// POST /api/acceptCeasefire
app.post("/api/acceptCeasefire", async (req, res) => {
  const userIp = req.userIp;
  const { warId } = req.body;

  if (!userIp)
    return res
      .status(401)
      .json({ success: false, message: "IPアドレスが取得できません。" });
  if (!warId)
    return res
      .status(400)
      .json({ success: false, message: "戦争IDが不正です。" });

  try {
    const war = await War.findOne({ warId });
    if (!war)
      return res
        .status(404)
        .json({ success: false, message: "戦争が見つかりません。" });
    if (war.status === "Ceasefire")
      return res
        .status(409)
        .json({ success: false, message: "すでに停戦中です。" });
    if (
      war.status === "Ended" ||
      war.status === "Cancelled" ||
      war.status === constants.WAR_STATUS_WHITE_PEACE_PROPOSED
    )
      return res.status(400).json({
        success: false,
        message: "この戦争はすでに終了しているか、白紙講和が提案されています。",
      });
    if (war.attackerIp !== userIp && war.defenderIp !== userIp)
      return res.status(403).json({
        success: false,
        message: "あなたはこの戦争の参加者ではありません。",
      });

    const otherPartyIp =
      war.attackerIp === userIp ? war.defenderIp : war.attackerIp;
    if (war.ceasefireProposedBy !== otherPartyIp)
      return res
        .status(400)
        .json({ success: false, message: "相手から停戦の提案がありません。" });

    await War.updateOne(
      { warId },
      { $set: { status: "Ceasefire", ceasefireProposedBy: "" } }
    );

    const myNationName = (await getNationInfoByIp(userIp)).name;
    const otherNationName = (await getNationInfoByIp(otherPartyIp)).name;

    await addNews(
      `${myNationName} が ${otherNationName} との停戦を承認しました。講和会議が可能です。`
    );
    res.json({
      success: true,
      message: `${otherNationName} との停戦を承認しました。`,
    });
  } catch (error) {
    console.error("acceptCeasefire エラー:", error);
    res
      .status(500)
      .json({ success: false, message: "停戦承認中にエラーが発生しました。" });
  }
});

// POST /api/rejectCeasefire
app.post("/api/rejectCeasefire", async (req, res) => {
  const userIp = req.userIp;
  const { warId } = req.body;

  if (!userIp)
    return res
      .status(401)
      .json({ success: false, message: "IPアドレスが取得できません。" });
  if (!warId)
    return res
      .status(400)
      .json({ success: false, message: "戦争IDが不正です。" });

  try {
    const war = await War.findOne({ warId });
    if (!war)
      return res
        .status(404)
        .json({ success: false, message: "戦争が見つかりません。" });
    if (
      war.status === "Ended" ||
      war.status === "Cancelled" ||
      war.status === constants.WAR_STATUS_WHITE_PEACE_PROPOSED
    )
      return res.status(400).json({
        success: false,
        message: "この戦争はすでに終了しているか、白紙講和が提案されています。",
      });
    if (war.attackerIp !== userIp && war.defenderIp !== userIp)
      return res.status(403).json({
        success: false,
        message: "あなたはこの戦争の参加者ではありません。",
      });

    const otherPartyIp =
      war.attackerIp === userIp ? war.defenderIp : war.attackerIp;
    if (war.ceasefireProposedBy !== otherPartyIp)
      return res
        .status(400)
        .json({ success: false, message: "相手から停戦の提案がありません。" });

    await War.updateOne({ warId }, { $set: { ceasefireProposedBy: "" } }); // 提案をキャンセル

    const myNationName = (await getNationInfoByIp(userIp)).name;
    const otherNationName = (await getNationInfoByIp(otherPartyIp)).name;

    await addNews(
      `${myNationName} が ${otherNationName} との停戦提案を拒否しました。戦争は継続します。`
    );
    res.json({
      success: true,
      message: `${otherNationName} との停戦提案を拒否しました。`,
    });
  } catch (error) {
    console.error("rejectCeasefire エラー:", error);
    res
      .status(500)
      .json({ success: false, message: "停戦拒否中にエラーが発生しました。" });
  }
});

// POST /api/proposeWhitePeace
app.post("/api/proposeWhitePeace", async (req, res) => {
  const userIp = req.userIp;
  const { warId } = req.body;

  if (!userIp)
    return res
      .status(401)
      .json({ success: false, message: "IPアドレスが取得できません。" });
  if (!warId)
    return res
      .status(400)
      .json({ success: false, message: "戦争IDが不正です。" });

  try {
    const war = await War.findOne({ warId });
    if (!war)
      return res
        .status(404)
        .json({ success: false, message: "戦争が見つかりません。" });
    if (war.attackerIp !== userIp && war.defenderIp !== userIp)
      return res.status(403).json({
        success: false,
        message: "あなたはこの戦争の参加者ではありません。",
      });
    if (
      war.status === "Ceasefire" ||
      war.status === "Ended" ||
      war.status === "Cancelled" ||
      war.status === constants.WAR_STATUS_WHITE_PEACE_PROPOSED
    ) {
      return res.status(400).json({
        success: false,
        message: "この戦争は白紙講和を提案できる状態ではありません。",
      });
    }
    if (war.ceasefireProposedBy === userIp)
      return res
        .status(409)
        .json({ success: false, message: "すでに白紙講和を提案済みです。" });

    await War.updateOne(
      { warId },
      {
        $set: {
          status: constants.WAR_STATUS_WHITE_PEACE_PROPOSED,
          ceasefireProposedBy: userIp,
        },
      }
    );

    const myNationName = (await getNationInfoByIp(userIp)).name;
    const otherPartyIp =
      war.attackerIp === userIp ? war.defenderIp : war.attackerIp;
    const otherNationName = (await getNationInfoByIp(otherPartyIp)).name;

    await addNews(
      `${myNationName} が ${otherNationName} に白紙講和を提案しました。`
    );
    res.json({
      success: true,
      message: `${otherNationName} に白紙講和を提案しました。相手の承認を待っています。`,
    });
  } catch (error) {
    console.error("proposeWhitePeace エラー:", error);
    res.status(500).json({
      success: false,
      message: "白紙講和提案中にエラーが発生しました。",
    });
  }
});

// POST /api/acceptWhitePeace
app.post("/api/acceptWhitePeace", async (req, res) => {
  const userIp = req.userIp;
  const { warId } = req.body;

  if (!userIp)
    return res
      .status(401)
      .json({ success: false, message: "IPアドレスが取得できません。" });
  if (!warId)
    return res
      .status(400)
      .json({ success: false, message: "戦争IDが不正です。" });

  try {
    const war = await War.findOne({ warId });
    if (!war)
      return res
        .status(404)
        .json({ success: false, message: "戦争が見つかりません。" });
    if (war.status !== constants.WAR_STATUS_WHITE_PEACE_PROPOSED)
      return res.status(400).json({
        success: false,
        message: "この戦争は白紙講和を承認できる状態ではありません。",
      });
    if (war.attackerIp !== userIp && war.defenderIp !== userIp)
      return res.status(403).json({
        success: false,
        message: "あなたはこの戦争の参加者ではありません。",
      });

    const otherPartyIp =
      war.attackerIp === userIp ? war.defenderIp : war.attackerIp;
    if (war.ceasefireProposedBy !== otherPartyIp)
      return res.status(400).json({
        success: false,
        message: "相手から白紙講和の提案がありません。",
      });

    const initialTerritoryOwnership = JSON.parse(war.initialTerritoryOwnership);
    const allNations = await Nation.find({}).lean(); // 最新の全国家データを取得
    const nationMap = {}; // ownerIp -> nationObject
    allNations.forEach((n) => {
      nationMap[n.owner] = n;
    });

    let bulkOps = [];
    let populationChanges = {}; // {ownerIp: popDelta}

    for (const territory in initialTerritoryOwnership) {
      const initialOwnerIp = initialTerritoryOwnership[territory];

      // 現在の領土の所有者を見つける
      let currentOwnerIp = null;
      for (const owner of Object.keys(nationMap)) {
        if (nationMap[owner].territories.includes(territory)) {
          currentOwnerIp = owner;
          break;
        }
      }

      if (currentOwnerIp && currentOwnerIp !== initialOwnerIp) {
        // 所有者が変更されている場合、元に戻す
        // 旧所有者から領土を削除 (currentOwnerIp)
        bulkOps.push({
          updateOne: {
            filter: { owner: currentOwnerIp },
            update: { $pull: { territories: territory } },
          },
        });
        // 新所有者に領土を追加 (initialOwnerIp)
        bulkOps.push({
          updateOne: {
            filter: { owner: initialOwnerIp },
            update: { $push: { territories: territory } },
          },
        });

        // 人口移動の計算
        const popTransfer = 1000; // 領土ごとに1000人移動と仮定
        populationChanges[initialOwnerIp] =
          (populationChanges[initialOwnerIp] || 0) + popTransfer;
        populationChanges[currentOwnerIp] =
          (populationChanges[currentOwnerIp] || 0) - popTransfer;
      }
    }

    // 人口変更をbulkOpsに追加
    for (const ownerIp in populationChanges) {
      bulkOps.push({
        updateOne: {
          filter: { owner: ownerIp },
          update: { $inc: { population: populationChanges[ownerIp] } },
        },
      });
    }

    if (bulkOps.length > 0) {
      await Nation.bulkWrite(bulkOps);
    }

    await War.updateOne(
      { warId },
      { $set: { status: "Ended", ceasefireProposedBy: "" } }
    );

    const myNationName = (await getNationInfoByIp(userIp)).name;
    const otherNationName = (await getNationInfoByIp(otherPartyIp)).name;

    await addNews(
      `${myNationName} が ${otherNationName} との白紙講和を承認しました。領土は戦争前の状態に戻りました。`
    );
    await removeNationsWithoutTerritories();

    res.json({
      success: true,
      message: `${otherNationName} との白紙講和を承認しました。領土は戦争前の状態に戻りました。`,
    });
  } catch (error) {
    console.error("acceptWhitePeace エラー:", error);
    res.status(500).json({
      success: false,
      message: `白紙講和の処理中にエラーが発生しました: ${error.message}`,
    });
  }
});

// POST /api/rejectWhitePeace
app.post("/api/rejectWhitePeace", async (req, res) => {
  const userIp = req.userIp;
  const { warId } = req.body;

  if (!userIp)
    return res
      .status(401)
      .json({ success: false, message: "IPアドレスが取得できません。" });
  if (!warId)
    return res
      .status(400)
      .json({ success: false, message: "戦争IDが不正です。" });

  try {
    const war = await War.findOne({ warId });
    if (!war)
      return res
        .status(404)
        .json({ success: false, message: "戦争が見つかりません。" });
    if (war.status !== constants.WAR_STATUS_WHITE_PEACE_PROPOSED)
      return res.status(400).json({
        success: false,
        message: "この戦争は白紙講和を拒否できる状態ではありません。",
      });
    if (war.attackerIp !== userIp && war.defenderIp !== userIp)
      return res.status(403).json({
        success: false,
        message: "あなたはこの戦争の参加者ではありません。",
      });

    const otherPartyIp =
      war.attackerIp === userIp ? war.defenderIp : war.attackerIp;
    if (war.ceasefireProposedBy !== otherPartyIp)
      return res.status(400).json({
        success: false,
        message: "相手から白紙講和の提案がありません。",
      });

    await War.updateOne(
      { warId },
      { $set: { status: "Ongoing", ceasefireProposedBy: "" } }
    ); // ステータスをOngoingに戻し、提案をクリア

    const myNationName = (await getNationInfoByIp(userIp)).name;
    const otherNationName = (await getNationInfoByIp(otherPartyIp)).name;

    await addNews(
      `${myNationName} が ${otherNationName} との白紙講和提案を拒否しました。戦争は継続します。`
    );
    res.json({
      success: true,
      message: `${otherNationName} との白紙講和提案を拒否しました。`,
    });
  } catch (error) {
    console.error("rejectWhitePeace エラー:", error);
    res.status(500).json({
      success: false,
      message: "白紙講和の拒否中にエラーが発生しました。",
    });
  }
});

// POST /api/startPeaceConference
app.post("/api/startPeaceConference", async (req, res) => {
  const userIp = req.userIp;
  const { warId } = req.body;

  if (!userIp)
    return res
      .status(401)
      .json({ success: false, message: "IPアドレスが取得できません。" });
  if (!warId)
    return res
      .status(400)
      .json({ success: false, message: "戦争IDが不正です。" });

  try {
    const war = await War.findOne({ warId });
    if (!war)
      return res
        .status(404)
        .json({ success: false, message: "戦争が見つかりません。" });
    if (war.status !== "Ceasefire")
      return res.status(400).json({
        success: false,
        message: "停戦中の戦争のみ講和会議を開始できます。",
      });

    const isAttacker = war.attackerIp === userIp;
    const myWarScore = isAttacker ? war.attackerWarScore : war.defenderWarScore;
    const opponentWarScore = isAttacker
      ? war.defenderWarScore
      : war.attackerWarScore;

    const myNation = await getNationInfoByIp(userIp);
    const opponentNation = isAttacker
      ? await getNationInfoByIp(war.defenderIp)
      : await getNationInfoByIp(war.attackerIp);

    if (!myNation || !opponentNation)
      return res
        .status(404)
        .json({ success: false, message: "参加国の情報が見つかりません。" });

    let winnerIp = "";
    let loserIp = "";
    let winnerNationName = "";
    let loserNationName = "";
    let availableWarPoints = 0;

    if (myWarScore > opponentWarScore) {
      winnerIp = userIp;
      loserIp = opponentNation.owner;
      winnerNationName = myNation.name;
      loserNationName = opponentNation.name;
      availableWarPoints = myWarScore - opponentWarScore;
    } else if (opponentWarScore > myWarScore) {
      winnerIp = opponentNation.owner;
      loserIp = userIp;
      winnerNationName = opponentNation.name;
      loserNationName = myNation.name;
      availableWarPoints = opponentWarScore - myWarScore;
    } else {
      return res.status(400).json({
        success: false,
        message:
          "戦争スコアが同点のため、講和会議で要求を行うことはできません。",
      });
    }

    if (winnerIp !== userIp) {
      return res.status(403).json({
        success: false,
        message: "あなたが勝利国ではないため、要求を行うことはできません。",
      });
    }

    const loserNationData = await getNationInfoByIp(loserIp);
    if (!loserNationData) {
      return res
        .status(404)
        .json({ success: false, message: "敗戦国の情報が見つかりません。" });
    }

    res.json({
      success: true,
      message: "講和会議を開始します。",
      war: {
        warId: war.warId,
        attackerIp: war.attackerIp,
        defenderIp: war.defenderIp,
        status: war.status,
        attackerNationName: war.attackerNationName,
        defenderNationName: war.defenderNationName,
        attackerWarScore: war.attackerWarScore,
        defenderWarScore: war.defenderWarScore,
      },
      winnerIp: winnerIp,
      loserIp: loserIp,
      winnerNationName: winnerNationName,
      loserNationName: loserNationName,
      availableWarPoints: availableWarPoints,
      loserCurrentMoney: loserNationData.money,
      loserCurrentOil: loserNationData.oil,
      loserCurrentIron: loserNationData.iron,
      loserCurrentInfantry: loserNationData.infantry,
      loserCurrentTank: loserNationData.tank,
      loserCurrentMechanizedInfantry: loserNationData.mechanizedInfantry,
      loserCurrentBomber: loserNationData.bomber,
      loserCurrentMissile: loserNationData.missile,
      loserCurrentNuclearMissile: loserNationData.nuclearMissile,
      loserCurrentArtillery: loserNationData.artillery,
      loserTerritories: Array.isArray(loserNationData.territories)
        ? loserNationData.territories.slice()
        : [],
    });
  } catch (error) {
    console.error("startPeaceConference エラー:", error);
    res.status(500).json({
      success: false,
      message: `講和会議の開始中にエラーが発生しました: ${error.message}`,
    });
  }
});

// POST /api/makePeaceDemands
app.post("/api/makePeaceDemands", async (req, res) => {
  const userIp = req.userIp;
  const { warId, demands } = req.body;

  if (!userIp)
    return res
      .status(401)
      .json({ success: false, message: "IPアドレスが取得できません。" });
  if (!warId)
    return res
      .status(400)
      .json({ success: false, message: "戦争IDが不正です。" });
  if (!demands)
    return res
      .status(400)
      .json({ success: false, message: "要求が指定されていません。" });

  try {
    const war = await War.findOne({ warId });
    if (!war)
      return res
        .status(404)
        .json({ success: false, message: "戦争が見つかりません。" });
    if (war.status !== "Ceasefire")
      return res.status(400).json({
        success: false,
        message: "停戦中の戦争のみ講和会議を進行できます。",
      });

    const isAttacker = war.attackerIp === userIp;
    const myWarScore = isAttacker ? war.attackerWarScore : war.defenderWarScore;
    const opponentWarScore = isAttacker
      ? war.defenderWarScore
      : war.attackerWarScore;

    let winnerIp = "";
    let loserIp = "";
    let availableWarPoints = 0;

    if (myWarScore > opponentWarScore) {
      winnerIp = userIp;
      loserIp = isAttacker ? war.defenderIp : war.attackerIp;
      availableWarPoints = myWarScore - opponentWarScore;
    } else if (opponentWarScore > myWarScore) {
      winnerIp = isAttacker ? war.defenderIp : war.attackerIp;
      loserIp = userIp; // Current user is the loser
      availableWarPoints = opponentWarScore - myWarScore;
    } else {
      return res.status(400).json({
        success: false,
        message: "戦争スコアが同点のため、要求を行うことはできません。",
      });
    }

    if (winnerIp !== userIp) {
      return res.status(403).json({
        success: false,
        message: "あなたが勝利国ではないため、要求を行うことはできません。",
      });
    }

    const winnerNation = await getNationInfoByIp(winnerIp);
    const loserNation = await getNationInfoByIp(loserIp);

    if (!winnerNation || !loserNation)
      return res
        .status(404)
        .json({ success: false, message: "参加国の情報が見つかりません。" });

    let totalCost = 0;
    const demandedMoney = parseInt(demands.money, 10) || 0;
    const demandedOil = parseInt(demands.oil, 10) || 0;
    const demandedIron = parseInt(demands.iron, 10) || 0;
    const demandedInfantry = parseInt(demands.infantry, 10) || 0;
    const demandedTank = parseInt(demands.tank, 10) || 0;
    const demandedMechanizedInfantry =
      parseInt(demands.mechanizedInfantry, 10) || 0;
    const demandedBomber = parseInt(demands.bomber, 10) || 0;
    const demandedMissile = parseInt(demands.missile, 10) || 0;
    const demandedNuclearMissile = parseInt(demands.nuclearMissile, 10) || 0;
    const demandedArtillery = parseInt(demands.artillery, 10) || 0;
    const demandedTerritories = demands.territories || [];

    // --- サーバーサイドバリデーション: 要求量が敗戦国の保有量を超えていないか ---
    if (demandedMoney < 0 || demandedMoney > loserNation.money)
      return res.status(400).json({
        success: false,
        message: `要求されたお金(${demandedMoney})が不正な値か、敗戦国(${loserNation.name})の所持金(${loserNation.money})を超えています。`,
      });
    if (demandedOil < 0 || demandedOil > loserNation.oil)
      return res.status(400).json({
        success: false,
        message: `要求された石油(${demandedOil})が不正な値か、敗戦国(${loserNation.name})の所持石油(${loserNation.oil})を超えています。`,
      });
    if (demandedIron < 0 || demandedIron > loserNation.iron)
      return res.status(400).json({
        success: false,
        message: `要求された鉄(${demandedIron})が不正な値か、敗戦国(${loserNation.name})の所持鉄(${loserNation.iron})を超えています。`,
      });
    if (demandedInfantry < 0 || demandedInfantry > loserNation.infantry)
      return res.status(400).json({
        success: false,
        message: `要求された歩兵(${demandedInfantry})が不正な値か、敗戦国(${loserNation.name})の所持歩兵(${loserNation.infantry})を超えています。`,
      });
    if (demandedTank < 0 || demandedTank > loserNation.tank)
      return res.status(400).json({
        success: false,
        message: `要求された戦車(${demandedTank})が不正な値か、敗戦国(${loserNation.name})の所持戦車(${loserNation.tank})を超えています。`,
      });
    if (
      demandedMechanizedInfantry < 0 ||
      demandedMechanizedInfantry > loserNation.mechanizedInfantry
    )
      return res.status(400).json({
        success: false,
        message: `要求された機械化歩兵(${demandedMechanizedInfantry})が不正な値か、敗戦国(${loserNation.name})の所持機械化歩兵(${loserNation.mechanizedInfantry})を超えています。`,
      });
    if (demandedBomber < 0 || demandedBomber > loserNation.bomber)
      return res.status(400).json({
        success: false,
        message: `要求された爆撃機(${demands.bomber})が不正な値か、敗戦国(${loserNation.name})の所持爆撃機(${loserNation.bomber})を超えています。`,
      });
    if (demandedMissile < 0 || demandedMissile > loserNation.missile)
      return res.status(400).json({
        success: false,
        message: `要求されたミサイル(${demandedMissile})が不正な値か、敗戦国(${loserNation.name})の所持ミサイル(${loserNation.missile})を超えています。`,
      });
    if (
      demandedNuclearMissile < 0 ||
      demandedNuclearMissile > loserNation.nuclearMissile
    )
      return res.status(400).json({
        success: false,
        message: `要求された核ミサイル(${demandedNuclearMissile})が不正な値か、敗戦国(${loserNation.name})の所持核ミサイル(${loserNation.nuclearMissile})を超えています。`,
      });
    if (demandedArtillery < 0 || demandedArtillery > loserNation.artillery)
      return res.status(400).json({
        success: false,
        message: `要求された砲兵(${demandedArtillery})が不正な値か、敗戦国(${loserNation.name})の所持砲兵(${loserNation.artillery})を超えています。`,
      });

    for (const territory of demandedTerritories) {
      if (!loserNation.territories.includes(territory))
        return res.status(400).json({
          success: false,
          message: `要求された領土(${territory})は敗戦国(${loserNation.name})が所有していません。`,
        });
    }

    // 戦勝点コスト計算
    totalCost +=
      Math.ceil(demandedMoney / 1000) * constants.PEACE_COST_MONEY_PER_1000;
    totalCost += Math.ceil(demandedOil / 10) * constants.PEACE_COST_OIL_PER_10;
    totalCost +=
      Math.ceil(demandedIron / 10) * constants.PEACE_COST_IRON_PER_10;
    totalCost += demandedInfantry * constants.PEACE_COST_INFANTRY;
    totalCost += demandedTank * constants.PEACE_COST_TANK;
    totalCost +=
      demandedMechanizedInfantry * constants.PEACE_COST_MECHANIZED_INFANTRY;
    totalCost += demandedBomber * constants.PEACE_COST_BOMBER;
    totalCost += demandedMissile * constants.PEACE_COST_MISSILE;
    totalCost += demandedNuclearMissile * constants.PEACE_COST_NUCLEAR_MISSILE;
    totalCost += demandedArtillery * constants.PEACE_COST_ARTILLERY;
    totalCost += demandedTerritories.length * constants.PEACE_COST_TERRITORY;

    if (totalCost > availableWarPoints)
      return res.status(402).json({
        success: false,
        message: `戦勝点が足りません。要求総コスト: ${totalCost}, 利用可能戦勝点: ${availableWarPoints}`,
      });

    // 要求の適用
    let bulkOps = [];

    // お金
    if (demandedMoney > 0) {
      bulkOps.push({
        updateOne: {
          filter: { owner: loserIp },
          update: { $inc: { money: -demandedMoney } },
        },
      });
      bulkOps.push({
        updateOne: {
          filter: { owner: winnerIp },
          update: { $inc: { money: demandedMoney } },
        },
      });
    }
    // 石油
    if (demandedOil > 0) {
      bulkOps.push({
        updateOne: {
          filter: { owner: loserIp },
          update: { $inc: { oil: -demandedOil } },
        },
      });
      bulkOps.push({
        updateOne: {
          filter: { owner: winnerIp },
          update: { $inc: { oil: demandedOil } },
        },
      });
    }
    // 鉄
    if (demandedIron > 0) {
      bulkOps.push({
        updateOne: {
          filter: { owner: loserIp },
          update: { $inc: { iron: -demandedIron } },
        },
      });
      bulkOps.push({
        updateOne: {
          filter: { owner: winnerIp },
          update: { $inc: { iron: demandedIron } },
        },
      });
    }
    // 部隊
    if (demandedInfantry > 0) {
      bulkOps.push({
        updateOne: {
          filter: { owner: loserIp },
          update: { $inc: { infantry: -demandedInfantry } },
        },
      });
      bulkOps.push({
        updateOne: {
          filter: { owner: winnerIp },
          update: { $inc: { infantry: demandedInfantry } },
        },
      });
    }
    if (demandedTank > 0) {
      bulkOps.push({
        updateOne: {
          filter: { owner: loserIp },
          update: { $inc: { tank: -demandedTank } },
        },
      });
      bulkOps.push({
        updateOne: {
          filter: { owner: winnerIp },
          update: { $inc: { tank: demandedTank } },
        },
      });
    }
    if (demandedMechanizedInfantry > 0) {
      bulkOps.push({
        updateOne: {
          filter: { owner: loserIp },
          update: { $inc: { mechanizedInfantry: -demandedMechanizedInfantry } },
        },
      });
      bulkOps.push({
        updateOne: {
          filter: { owner: winnerIp },
          update: { $inc: { mechanizedInfantry: demandedMechanizedInfantry } },
        },
      });
    }
    if (demandedBomber > 0) {
      bulkOps.push({
        updateOne: {
          filter: { owner: loserIp },
          update: { $inc: { bomber: -demandedBomber } },
        },
      });
      bulkOps.push({
        updateOne: {
          filter: { owner: winnerIp },
          update: { $inc: { bomber: demandedBomber } },
        },
      });
    }
    if (demandedMissile > 0) {
      bulkOps.push({
        updateOne: {
          filter: { owner: loserIp },
          update: { $inc: { missile: -demandedMissile } },
        },
      });
      bulkOps.push({
        updateOne: {
          filter: { owner: winnerIp },
          update: { $inc: { missile: demandedMissile } },
        },
      });
    }
    if (demandedNuclearMissile > 0) {
      bulkOps.push({
        updateOne: {
          filter: { owner: loserIp },
          update: { $inc: { nuclearMissile: -demandedNuclearMissile } },
        },
      });
      bulkOps.push({
        updateOne: {
          filter: { owner: winnerIp },
          update: { $inc: { nuclearMissile: demandedNuclearMissile } },
        },
      });
    }
    if (demandedArtillery > 0) {
      bulkOps.push({
        updateOne: {
          filter: { owner: loserIp },
          update: { $inc: { artillery: -demandedArtillery } },
        },
      });
      bulkOps.push({
        updateOne: {
          filter: { owner: winnerIp },
          update: { $inc: { artillery: demandedArtillery } },
        },
      });
    }

    // 領土譲渡
    let totalPopulationTransfer = 0;
    for (const territory of demandedTerritories) {
      bulkOps.push({
        updateOne: {
          filter: { owner: loserIp },
          update: { $pull: { territories: territory } },
        },
      });
      bulkOps.push({
        updateOne: {
          filter: { owner: winnerIp },
          update: { $push: { territories: territory } },
        },
      });
      totalPopulationTransfer += 1000; // 領土移動による人口増減
      await addNews(
        `${winnerNation.name} が ${loserNation.name} から領土 ${territory} を獲得しました。`
      );
    }

    // 領土変更に伴う人口調整もbulkOpsに追加
    if (totalPopulationTransfer > 0) {
      bulkOps.push({
        updateOne: {
          filter: { owner: winnerIp },
          update: { $inc: { population: totalPopulationTransfer } },
        },
      });
      bulkOps.push({
        updateOne: {
          filter: { owner: loserIp },
          update: { $inc: { population: -totalPopulationTransfer } },
        },
      });
    }

    if (bulkOps.length > 0) {
      await Nation.bulkWrite(bulkOps);
    }

    // 戦争を終了
    await War.updateOne({ warId }, { $set: { status: "Ended" } });

    await addNews(
      `${winnerNation.name} と ${loserNation.name} の間で講和が成立しました。`
    );
    await removeNationsWithoutTerritories();

    res.json({
      success: true,
      message: "講和会議が完了し、要求が適用されました。",
    });
  } catch (error) {
    console.error("makePeaceDemands エラー:", error);
    res.status(500).json({
      success: false,
      message: `講和会議の処理中にエラーが発生しました: ${error.message}`,
    });
  }
});

// POST /api/cancelWar
app.post("/api/cancelWar", async (req, res) => {
  const userIp = req.userIp;
  const { warId } = req.body;

  if (!userIp)
    return res
      .status(401)
      .json({ success: false, message: "IPアドレスが取得できません。" });
  if (!warId)
    return res
      .status(400)
      .json({ success: false, message: "戦争IDが不正です。" });

  try {
    const war = await War.findOne({ warId });
    if (!war)
      return res
        .status(404)
        .json({ success: false, message: "戦争が見つかりません。" });
    if (war.attackerIp !== userIp && war.defenderIp !== userIp)
      return res.status(403).json({
        success: false,
        message: "あなたはこの戦争の参加者ではありません。",
      });
    if (war.status === "Ended" || war.status === "Cancelled")
      return res
        .status(400)
        .json({ success: false, message: "この戦争はすでに終了しています。" });

    await War.updateOne(
      { warId },
      { $set: { status: "Cancelled", ceasefireProposedBy: "" } }
    );

    const myNationName = (await getNationInfoByIp(userIp)).name;
    const otherNationIp =
      war.attackerIp === userIp ? war.defenderIp : war.attackerIp;
    const otherNationName = (await getNationInfoByIp(otherNationIp)).name;

    await addNews(
      `${myNationName} が ${otherNationName} との戦争を一方的に中止しました。`
    );
    res.json({ success: true, message: "戦争を中止しました。" });
  } catch (error) {
    console.error("cancelWar エラー:", error);
    res
      .status(500)
      .json({ success: false, message: "戦争中止中にエラーが発生しました。" });
  }
});

// Alliance System Endpoints
// POST /api/requestAlliance
app.post("/api/requestAlliance", async (req, res) => {
  const userIp = req.userIp;
  const { targetNationName } = req.body;

  if (!userIp)
    return res
      .status(401)
      .json({ success: false, message: "IPアドレスが取得できません。" });
  if (!targetNationName || targetNationName.trim() === "")
    return res.status(400).json({
      success: false,
      message: "同盟申請先の国名を入力してください。",
    });

  try {
    const requesterNation = await Nation.findOne({ owner: userIp });
    if (!requesterNation)
      return res
        .status(404)
        .json({ success: false, message: "あなたの国が見つかりません。" });
    const approverNation = await Nation.findOne({ name: targetNationName });
    if (!approverNation)
      return res
        .status(404)
        .json({ success: false, message: "同盟申請先の国が見つかりません。" });
    if (requesterNation.owner === approverNation.owner)
      return res.status(400).json({
        success: false,
        message: "自分自身と同盟を組むことはできません。",
      });

    const existingAlliance = await Alliance.findOne({
      $or: [
        {
          requesterIp: requesterNation.owner,
          approverIp: approverNation.owner,
        },
        {
          requesterIp: approverNation.owner,
          approverIp: requesterNation.owner,
        },
      ],
      status: { $in: ["Pending", "Approved"] },
    });

    if (existingAlliance) {
      if (existingAlliance.status === "Approved")
        return res.status(409).json({
          success: false,
          message: `${targetNationName}とはすでに同盟関係にあります。`,
        });
      if (existingAlliance.requesterIp === requesterNation.owner)
        return res.status(409).json({
          success: false,
          message: `${targetNationName}への同盟申請はすでに送信済みです。`,
        });
      return res.status(409).json({
        success: false,
        message: `${targetNationName}からあなたへの同盟申請がすでにあります。そちらを承認してください。`,
      });
    }

    await Alliance.create({
      requesterIp: requesterNation.owner,
      requesterNationName: requesterNation.name,
      approverIp: approverNation.owner,
      approverNationName: approverNation.name,
      status: "Pending",
    });
    await addNews(
      `${requesterNation.name}が${approverNation.name}に同盟を申請しました。`
    );
    res.json({
      success: true,
      message: `${targetNationName}に同盟申請を送信しました。`,
    });
  } catch (error) {
    console.error("requestAlliance エラー:", error);
    res
      .status(500)
      .json({ success: false, message: "同盟申請中にエラーが発生しました。" });
  }
});

// POST /api/respondToAllianceRequest
app.post("/api/respondToAllianceRequest", async (req, res) => {
  const userIp = req.userIp;
  const { requesterIp, response } = req.body;

  if (!userIp)
    return res
      .status(401)
      .json({ success: false, message: "IPアドレスが取得できません。" });
  if (!requesterIp || (response !== "approve" && response !== "reject"))
    return res
      .status(400)
      .json({ success: false, message: "不正なリクエストです。" });

  try {
    const allianceRequest = await Alliance.findOne({
      requesterIp,
      approverIp: userIp,
      status: "Pending",
    });
    if (!allianceRequest)
      return res.status(404).json({
        success: false,
        message: "該当する同盟申請が見つかりません。",
      });

    if (response === "approve") {
      await Alliance.updateOne(
        { _id: allianceRequest._id },
        { $set: { status: "Approved" } }
      );
      await addNews(
        `${allianceRequest.approverNationName}が${allianceRequest.requesterNationName}との同盟を承認しました！`
      );
      res.json({
        success: true,
        message: `${allianceRequest.requesterNationName}との同盟を承認しました。`,
      });
    } else if (response === "reject") {
      await Alliance.deleteOne({ _id: allianceRequest._id });
      await addNews(
        `${allianceRequest.approverNationName}が${allianceRequest.requesterNationName}との同盟を拒否しました。`
      );
      res.json({
        success: true,
        message: `${allianceRequest.requesterNationName}との同盟を拒否しました。`,
      });
    }
  } catch (error) {
    console.error("respondToAllianceRequest エラー:", error);
    res.status(500).json({
      success: false,
      message: "同盟申請への応答中にエラーが発生しました。",
    });
  }
});

// GET /api/getAlliances
app.get("/api/getAlliances", async (req, res) => {
  const userIp = req.userIp;
  if (!userIp)
    return res.status(401).json({
      pendingRequests: [],
      approvedAlliances: [],
      message: "IPアドレスが取得できません。",
    });

  try {
    const allAlliances = await Alliance.find({
      $or: [{ requesterIp: userIp }, { approverIp: userIp }],
    });

    const pendingRequests = [];
    const approvedAlliances = [];

    for (const alliance of allAlliances) {
      if (alliance.status === "Pending" && alliance.approverIp === userIp) {
        pendingRequests.push({
          requesterIp: alliance.requesterIp,
          requesterNationName: alliance.requesterNationName,
        });
      } else if (alliance.status === "Approved") {
        const alliedIp =
          alliance.requesterIp === userIp
            ? alliance.approverIp
            : alliance.requesterIp;
        const alliedNationName =
          alliance.requesterIp === userIp
            ? alliance.approverNationName
            : alliance.requesterNationName;
        approvedAlliances.push({
          ip: alliedIp,
          nationName: alliedNationName,
        });
      }
    }
    res.json({ pendingRequests, approvedAlliances });
  } catch (error) {
    console.error("getAlliances エラー:", error);
    res.status(500).json({
      pendingRequests: [],
      approvedAlliances: [],
      message: "同盟情報の取得中にエラーが発生しました。",
    });
  }
});

// POST /api/dissolveAlliance
app.post("/api/dissolveAlliance", async (req, res) => {
  const userIp = req.userIp;
  const { alliedNationIp } = req.body;

  if (!userIp)
    return res
      .status(401)
      .json({ success: false, message: "IPアドレスが取得できません。" });
  if (!alliedNationIp || alliedNationIp.trim() === "")
    return res
      .status(400)
      .json({ success: false, message: "同盟国のIPアドレスが不正です。" });

  try {
    const alliance = await Alliance.findOne({
      $or: [
        { requesterIp: userIp, approverIp: alliedNationIp, status: "Approved" },
        { requesterIp: alliedNationIp, approverIp: userIp, status: "Approved" },
      ],
    });

    if (!alliance)
      return res
        .status(404)
        .json({ success: false, message: "該当する同盟が見つかりません。" });

    await Alliance.deleteOne({ _id: alliance._id });

    const dissolvedNationName = (await getNationInfoByIp(userIp)).name;
    const dissolvedPartnerName = (await getNationInfoByIp(alliedNationIp)).name;
    await addNews(
      `${dissolvedNationName}が${dissolvedPartnerName}との同盟を解除しました。`
    );

    res.json({
      success: true,
      message: `${dissolvedPartnerName}との同盟を解除しました。`,
    });
  } catch (error) {
    console.error("dissolveAlliance エラー:", error);
    res
      .status(500)
      .json({ success: false, message: "同盟解除中にエラーが発生しました。" });
  }
});

// Title Management Endpoints
// GET /api/getTitleDefinitions
app.get("/api/titleDefinitions", (req, res) => {
  res.json(TITLE_DEFINITIONS); // 定義を直接返す
});

// GET /api/getUserTitlesData
app.get("/api/getUserTitlesData", async (req, res) => {
  const userIp = req.userIp;
  if (!userIp)
    return res.status(401).json({
      acquiredTitles: [],
      selectedTitleId: "",
      message: "IPアドレスが取得できません。",
    });

  try {
    const userNation = await Nation.findOne({ owner: userIp }).select(
      "acquiredTitles selectedTitleId"
    );
    if (!userNation)
      return res.status(404).json({
        acquiredTitles: [],
        selectedTitleId: "",
        message: "あなたの国が見つかりません。",
      });

    res.json({
      acquiredTitles: userNation.acquiredTitles,
      selectedTitleId: userNation.selectedTitleId,
    });
  } catch (error) {
    console.error("getUserTitlesData エラー:", error);
    res.status(500).json({
      acquiredTitles: [],
      selectedTitleId: "",
      message: "称号情報の取得中にエラーが発生しました。",
    });
  }
});

// POST /api/selectDisplayTitle
app.post("/api/selectDisplayTitle", async (req, res) => {
  const userIp = req.userIp;
  const { titleId } = req.body;

  if (!userIp)
    return res
      .status(401)
      .json({ success: false, message: "IPアドレスが取得できません。" });
  if (!titleId || titleId.trim() === "")
    return res
      .status(400)
      .json({ success: false, message: "無効な称号IDです。" });

  try {
    const userNation = await Nation.findOne({ owner: userIp });
    if (!userNation)
      return res
        .status(404)
        .json({ success: false, message: "あなたの国が見つかりません。" });

    if (!userNation.acquiredTitles.includes(titleId))
      return res
        .status(403)
        .json({ success: false, message: "その称号を所有していません。" });
    if (!TITLE_DEFINITIONS[titleId])
      return res
        .status(404)
        .json({ success: false, message: "その称号は存在しません。" });

    await Nation.updateOne(
      { owner: userIp },
      { $set: { selectedTitleId: titleId } }
    );
    // チャットログにも選択された称号を反映させるために更新 (最新のアクティビティを考慮)
    await ChatLog.updateMany(
      { userIp },
      { $set: { selectedTitleId: titleId, flagUrl: userNation.flagUrl } }
    );

    const selectedTitleName = TITLE_DEFINITIONS[titleId].name;
    await addNews(
      `${userNation.name} が称号を「${selectedTitleName}」に設定しました。`
    );

    res.json({
      success: true,
      message: `称号を「${selectedTitleName}」に設定しました。`,
    });
  } catch (error) {
    console.error("selectDisplayTitle エラー:", error);
    res.status(500).json({
      success: false,
      message: "表示称号の選択中にエラーが発生しました。",
    });
  }
});

// POST /api/grantTitleToUser (Admin/Game Logic)
app.post("/api/grantTitleToUser", async (req, res) => {
  // Note: This endpoint should ideally be protected by admin authentication
  const userIp = req.userIp; // (for simplicity, we assume the caller is authorized for testing)
  const { targetUserIp, titleId } = req.body;

  if (!userIp)
    return res
      .status(401)
      .json({ success: false, message: "IPアドレスが取得できません。" }); // Calling admin's IP
  if (!targetUserIp || targetUserIp.trim() === "")
    return res.status(400).json({
      success: false,
      message: "対象ユーザーのIPアドレスが不正です。",
    });
  if (!titleId || titleId.trim() === "")
    return res
      .status(400)
      .json({ success: false, message: "称号IDが不正です。" });

  try {
    const targetNation = await Nation.findOne({ owner: targetUserIp });
    if (!targetNation)
      return res
        .status(404)
        .json({ success: false, message: "対象の国が見つかりません。" });

    if (!TITLE_DEFINITIONS[titleId])
      return res
        .status(404)
        .json({ success: false, message: "その称号は存在しません。" });

    if (targetNation.acquiredTitles.includes(titleId)) {
      return res.json({
        success: false,
        message: "すでにその称号を所有しています。",
      });
    }

    await Nation.updateOne(
      { owner: targetUserIp },
      { $push: { acquiredTitles: titleId } }
    );

    const titleName = TITLE_DEFINITIONS[titleId].name;
    await addNews(
      `${targetNation.name} が称号「${titleName}」を獲得しました！`
    );
    res.json({
      success: true,
      message: `称号「${titleName}」を付与しました。`,
    });
  } catch (error) {
    console.error("grantTitleToUser エラー:", error);
    res
      .status(500)
      .json({ success: false, message: "称号付与中にエラーが発生しました。" });
  }
});

// GET /api/gameConstants
app.get("/api/gameConstants", (req, res) => {
  res.json(constants); // ゲーム定数を返す
});

// GET /api/onlineUsers
app.get("/api/getOnlineUserNames", async (req, res) => {
  try {
    const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
    const onlineActivities = await UserActivity.find({
      lastSeen: { $gt: thirtySecondsAgo },
    }).lean(); // .lean()でMongooseドキュメントを素のJavaScriptオブジェクトに変換

    const onlineUserIps = onlineActivities.map((activity) => activity.userIp);

    const onlineNations = await Nation.find({
      owner: { $in: onlineUserIps },
    })
      .select("name owner selectedTitleId flagUrl")
      .lean();

    const formattedOnlineUsers = onlineNations.map((nation) => ({
      nationName: nation.name,
      selectedTitleId: nation.selectedTitleId,
      flagUrl: nation.flagUrl,
    }));

    res.json(formattedOnlineUsers);
  } catch (error) {
    console.error("getOnlineUserNames エラー:", error);
    res.status(500).json({
      success: false,
      message: "オンラインユーザー情報の取得中にエラーが発生しました。",
    });
  }
});

// GET /api/news
app.get("/api/news", async (req, res) => {
  try {
    const news = await NewsLog.find({}).sort({ timestamp: -1 }).limit(50); // 最新50件
    const formattedNews = news
      .reverse()
      .map((item) => `[${format(item.timestamp, "HH:mm:ss")}] ${item.message}`);
    res.json(formattedNews);
  } catch (error) {
    console.error("getLatestNews エラー:", error);
    res.status(500).json({
      success: false,
      message: "最新ニュースの取得中にエラーが発生しました。",
    });
  }
});

// GET /api/checkTimeServer
app.get("/api/checkTimeServer", (req, res) => {
  const userIp = req.userIp;
  const today = new Date();
  const day = today.getDay(); // 0=日曜, 1=月曜,...,6=土曜
  const timeInMinutes = today.getHours() * 60 + today.getMinutes();

  // 特定ユーザーは常にプレイ可能 (テスト用、または管理者IP)
  if (ALWAYS_ALLOWED_IPS.includes(userIp)) return res.json({ status: "ok" });

  // 祝日判定 (Node.jsでは外部APIまたは手動管理が必要。今回は簡易的にfalse)
  const isHoliday = false; // Placeholder for actual holiday check

  // 土日・祝日は常にOK
  if (day === 0 || day === 6 || isHoliday) return res.json({ status: "ok" });

  // プレイ不可時間（分単位）
  let blockedTimes = [
    [8 * 60 + 45, 9 * 60 + 30],
    [9 * 60 + 35, 10 * 60 + 20],
    [10 * 60 + 40, 11 * 60 + 25],
    [11 * 60 + 30, 12 * 60 + 25],
  ];

  // 水曜日以外は午後もプレイ不可
  if (day !== 3) {
    blockedTimes.push([13 * 60 + 30, 14 * 60 + 15]);
    blockedTimes.push([14 * 60 + 20, 15 * 60 + 15]);
  }

  const isBlocked = blockedTimes.some(
    (range) => timeInMinutes >= range[0] && timeInMinutes <= range[1]
  );
  res.json({ status: isBlocked ? "blocked" : "ok" });
});

// ==========================================================
// 定期実行処理（GASの `processTurnlyUpdates` に対応）
// ==========================================================

async function addIncomePerMinute() {
  // 授業時間判定は定期実行では常に無効とします。
  // ゲーム内の通常の収入生成は時間帯を考慮しない。
  // ブラウザからのアクセス制限は `/api/checkTimeServer` で行う。

  try {
    const nations = await Nation.find({});
    const bulkOps = [];

    for (const nation of nations) {
      let moneyProductionBonus = 0;
      let populationGrowthBonus = 0;

      nation.completedFocuses.forEach((focusId) => {
        const focus = NATIONAL_FOCUSES[focusId];
        if (focus && focus.effects) {
          if (focus.effects.moneyProductionBonus) {
            moneyProductionBonus += focus.effects.moneyProductionBonus;
          }
          if (focus.effects.populationGrowthBonus) {
            populationGrowthBonus += focus.effects.populationGrowthBonus;
          }
        }
      });

      moneyProductionBonus +=
        nation.railways * constants.RAILWAY_MONEY_BONUS_PER_UNIT;
      populationGrowthBonus +=
        nation.railways * constants.RAILWAY_POP_BONUS_PER_UNIT;
      moneyProductionBonus +=
        nation.shinkansen * constants.SHINKANSEN_MONEY_BONUS_PER_UNIT;
      populationGrowthBonus +=
        nation.shinkansen * constants.SHINKANSEN_POP_BONUS_PER_UNIT;
      moneyProductionBonus +=
        nation.airports * constants.AIRPORT_MONEY_BONUS_PER_UNIT;
      moneyProductionBonus +=
        nation.tourismFacilities *
        constants.TOURISM_FACILITY_MONEY_BONUS_PER_UNIT;
      populationGrowthBonus +=
        nation.tourismFacilities *
        constants.TOURISM_FACILITY_POP_BONUS_PER_UNIT;

      const baseIncome = Math.floor(nation.population * 0.01);
      const totalIncome = Math.floor(baseIncome * (1 + moneyProductionBonus));

      const basePopulationGrowthRate = 0.00002;
      const totalPopulationGrowthRate =
        basePopulationGrowthRate + populationGrowthBonus;
      const populationGrowth = Math.floor(
        nation.population * totalPopulationGrowthRate
      );

      if (totalIncome > 0 || populationGrowth > 0) {
        bulkOps.push({
          updateOne: {
            filter: { _id: nation._id },
            update: {
              $inc: {
                money: totalIncome,
                population: populationGrowth,
              },
            },
          },
        });
      }
    }
    if (bulkOps.length > 0) {
      await Nation.bulkWrite(bulkOps);
    }
    console.log("addIncomePerMinute: 収入と人口を更新しました。");
  } catch (error) {
    console.error("addIncomePerMinute エラー:", error);
  }
}

async function addResourcesPerMinute() {
  try {
    const nations = await Nation.find({});
    const bulkOps = [];

    for (const nation of nations) {
      let totalOilProduction = 0;
      let totalIronProduction = 0;

      const numTerritories = nation.territories.length;
      totalOilProduction = numTerritories * 20;
      totalIronProduction = numTerritories * 20;

      let oilProductionBonus = 0;
      let ironProductionBonus = 0;
      nation.completedFocuses.forEach((focusId) => {
        const focus = NATIONAL_FOCUSES[focusId];
        if (focus && focus.effects) {
          if (focus.effects.oilProductionBonus) {
            oilProductionBonus += focus.effects.oilProductionBonus;
          }
          if (focus.effects.ironProductionBonus) {
            ironProductionBonus += focus.effects.ironProductionBonus;
          }
        }
      });

      totalOilProduction = Math.floor(
        totalOilProduction * (1 + oilProductionBonus)
      );
      totalIronProduction = Math.floor(
        totalIronProduction * (1 + ironProductionBonus)
      );

      if (totalOilProduction > 0 || totalIronProduction > 0) {
        bulkOps.push({
          updateOne: {
            filter: { _id: nation._id },
            update: {
              $inc: {
                oil: totalOilProduction,
                iron: totalIronProduction,
              },
            },
          },
        });
      }
    }
    if (bulkOps.length > 0) {
      await Nation.bulkWrite(bulkOps);
    }
    console.log("addResourcesPerMinute: 資源を更新しました。");
  } catch (error) {
    console.error("addResourcesPerMinute エラー:", error);
  }
}

async function processNationalFocusProgress() {
  try {
    const nations = await Nation.find({
      activeFocusId: { $ne: "" },
      focusTurnsRemaining: { $gt: 0 },
    });
    const bulkOps = [];

    for (const nation of nations) {
      const newTurnsRemaining = nation.focusTurnsRemaining - 1;
      const update = { focusTurnsRemaining: newTurnsRemaining };

      if (newTurnsRemaining === 0) {
        const completedFocus = NATIONAL_FOCUSES[nation.activeFocusId];
        if (completedFocus) {
          await addNews(
            `${nation.name} が国家方針「${completedFocus.name}」を完了しました！`
          );
          update.activeFocusId = "";
          update.$push = { completedFocuses: nation.activeFocusId };
          // 直接moneyGainがある場合のみここにロジックを追加
          if (completedFocus.effects.moneyGain) {
            update.$inc = { money: completedFocus.effects.moneyGain };
          }
        }
      }
      bulkOps.push({
        updateOne: { filter: { _id: nation._id }, update: update },
      });
    }
    if (bulkOps.length > 0) {
      await Nation.bulkWrite(bulkOps);
    }
    console.log("processNationalFocusProgress: 国家方針の進捗を更新しました。");
  } catch (error) {
    console.error("processNationalFocusProgress エラー:", error);
  }
}

// 飛行機便処理 (processFlights)
async function processFlights() {
  try {
    const allNations = await Nation.find({});
    const nationMap = new Map(allNations.map((n) => [n.owner, n])); // Map for quick lookup

    const changes = {}; // { ip: { moneyChange, popChange } }

    for (const nation of allNations) {
      if (!nation.flights || nation.flights.length === 0) continue;

      for (const flight of nation.flights) {
        if (flight.status !== "approved") continue;

        const targetNation = nationMap.get(flight.targetIp);

        if (
          !targetNation ||
          nation.airports === 0 ||
          targetNation.airports === 0
        ) {
          // 相手国が消滅、または空港がない場合、フライトを無効化（DBから削除）
          // 実際にはflight配列からpullする必要があるが、ここではスキップ
          continue;
        }

        if (nation.owner > targetNation.owner) continue; // 同じペアで2重処理を防ぐ

        if (!changes[nation.owner])
          changes[nation.owner] = { moneyChange: 0, popChange: 0 };
        if (!changes[targetNation.owner])
          changes[targetNation.owner] = { moneyChange: 0, popChange: 0 };

        changes[nation.owner].moneyChange +=
          constants.FLIGHT_MONEY_GAIN_PER_TURN;
        changes[targetNation.owner].moneyChange +=
          constants.FLIGHT_MONEY_GAIN_PER_TURN;

        const popDiff = Math.abs(nation.population - targetNation.population);
        const populationTransfer = Math.floor(
          popDiff * constants.FLIGHT_POPULATION_TRANSFER_RATE
        );

        if (populationTransfer > 0) {
          if (nation.population > targetNation.population) {
            changes[nation.owner].popChange -= populationTransfer;
            changes[targetNation.owner].popChange += populationTransfer;
            await addNews(
              `${nation.name}から${targetNation.name}へ飛行機便で人口${populationTransfer}人が移動しました。`
            );
          } else if (targetNation.population > nation.population) {
            changes[nation.owner].popChange += populationTransfer;
            changes[targetNation.owner].popChange -= populationTransfer;
            await addNews(
              `${targetNation.name}から${nation.name}へ飛行機便で人口${populationTransfer}人が移動しました。`
            );
          }
        }
      }
    }

    const bulkOps = [];
    for (const ip in changes) {
      const { moneyChange, popChange } = changes[ip];
      bulkOps.push({
        updateOne: {
          filter: { owner: ip },
          update: {
            $inc: {
              money: moneyChange,
              population: popChange,
            },
          },
        },
      });
    }
    if (bulkOps.length > 0) {
      await Nation.bulkWrite(bulkOps);
    }
    console.log("processFlights: 飛行機便による人口・資金移動を処理しました。");
  } catch (error) {
    console.error("processFlights エラー:", error);
  }
}

// 1分ごとに実行されるように設定 (GASの addIncomePerMinute と processNationalFocusProgress を統合)
cron.schedule("* * * * *", async () => {
  console.log("毎分定期アップデート実行...");
  await addIncomePerMinute();
  await addResourcesPerMinute();
  await processNationalFocusProgress();
  await processFlights();
  await removeNationsWithoutTerritories();
  console.log("定期アップデート完了。");
});

// ルートハンドラー: index.html を返す
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// サーバー起動
app.listen(PORT, async () => {
  await connectDB(); // サーバー起動時にDB接続
  console.log(`サーバーがポート ${PORT} で起動しました。`);
  console.log(`http://localhost:${PORT}`);
});
