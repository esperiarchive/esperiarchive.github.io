// Shared interface text. Story text and native game localizations are never translated here.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ReaderUI = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const messages = {
  "Feedback": {"cn": "反馈", "jp": "フィードバック", "kr": "피드백"},
  "Found a problem, a translation mistake, or something missing?": {"cn": "发现了问题、翻译错误或缺失内容？", "jp": "不具合や翻訳の間違い、掲載されていない内容に気づきましたか？", "kr": "오류나 번역 실수, 빠진 내용을 발견하셨나요?"},
  "Send feedback": {"cn": "发送反馈", "jp": "フィードバックを送る", "kr": "피드백 보내기"},
  "Home": {
    "cn": "首页",
    "jp": "ホーム",
    "kr": "홈"
  },
  "AFK Journey · Unofficial fan archive": {
    "cn": "剑与远征：启程 · 非官方同人档案",
    "jp": "AFK：ジャーニー · 非公式ファンアーカイブ",
    "kr": "AFK: 새로운 여정 · 비공식 팬 아카이브"
  },
  "Revisit the stories, characters, and lore of Esperia.": {
    "cn": "重温伊索米亚的故事、人物与世界。",
    "jp": "エスペリアの物語、キャラクター、世界観をもう一度。",
    "kr": "에스페리아의 이야기와 인물, 세계관을 다시 만나보세요."
  },
  "Browse stories": {
    "cn": "浏览故事",
    "jp": "ストーリーを読む",
    "kr": "스토리 둘러보기"
  },
  "Documents & Mail": {
    "cn": "文档与邮件",
    "jp": "文書・メール",
    "kr": "문서와 우편"
  },
  "Follow storylines, explore dialogue choices, and revisit your favorite scenes.": {
    "cn": "跟随故事，探索对话选项，重温你喜爱的场景。",
    "jp": "物語をたどり、会話の選択肢を読み比べ、お気に入りの場面を振り返りましょう。",
    "kr": "이야기를 따라가며 대화 선택지를 살펴보고, 좋아하는 장면을 다시 읽어보세요."
  },
  "Get to know Esperia's heroes through their profiles, conversations, and voices.": {
    "cn": "通过角色档案、对话和语音，了解伊索米亚的英雄们。",
    "jp": "プロフィールや会話、ボイスを通して、エスペリアの英雄たちを知ることができます。",
    "kr": "프로필과 대화, 음성을 통해 에스페리아의 영웅들을 알아보세요."
  },
  "Discover letters, journals, and the little details that fill out the world.": {
    "cn": "阅读信件与日记，发现让这个世界更加鲜活的小故事。",
    "jp": "手紙や日誌から、世界を彩る小さな物語を見つけましょう。",
    "kr": "편지와 일지 속에서 세계를 채우는 작은 이야기들을 발견해 보세요."
  },
  "An unofficial fan project. Game content belongs to its respective owners.": {
    "cn": "非官方同人项目。游戏内容的权利归各自权利人所有。",
    "jp": "非公式のファンプロジェクトです。ゲーム内素材の権利は各権利者に帰属します。",
    "kr": "비공식 팬 프로젝트입니다. 게임 콘텐츠의 권리는 각 권리자에게 있습니다."
  },
  "Along the route": {"cn":"途中","jp":"道中","kr":"이동 중"},
  "Battle dialogue": {"cn":"战斗对话","jp":"戦闘中の会話","kr":"전투 대화"},
  "Additional battle dialogue": {"cn":"其他战斗对话","jp":"追加の戦闘会話","kr":"추가 전투 대화"},
  "On arrival": {"cn":"抵达时","jp":"到着時","kr":"도착 시"},
  "While keeping up": {"cn":"跟上时的对话","jp":"ついて行く時の会話","kr":"따라가는 중 대화"},
  "If you fall behind": {"cn":"落后时的对话","jp":"遅れた時の会話","kr":"뒤처졌을 때 대화"},
  "Chapter artwork": {"cn":"篇章插画","jp":"チャプターイラスト","kr":"챕터 일러스트"},
  "Chapter opening": {"cn":"篇章开幕","jp":"チャプター開始","kr":"챕터 시작"},
  "Chapter ending": {"cn":"篇章落幕","jp":"チャプター終了","kr":"챕터 종료"},
  "Skip description": {
    "cn": "跳过剧情概述",
    "jp": "スキップ時のあらすじ",
    "kr": "스킵 줄거리"
  },
  "During the encounter": {
    "cn": "遭遇期间",
    "jp": "遭遇中の会話",
    "kr": "조우 중 대화"
  },
  "Shown if this point is reached while the encounter is active.": {
    "cn": "在遭遇仍在进行时到达此处，才会出现这段对话。",
    "jp": "遭遇が続いている間にこの時点に達すると表示されます。",
    "kr": "조우가 진행 중일 때 이 시점에 도달하면 표시됩니다."
  },
  "Story Archive": {
    "cn": "剧情档案",
    "jp": "ストーリーアーカイブ",
    "kr": "스토리 아카이브"
  },
  "Characters": {
    "cn": "角色",
    "jp": "キャラクター",
    "kr": "캐릭터"
  },
  "Documents": {
    "cn": "文献",
    "jp": "文書",
    "kr": "문서"
  },
  "Theme": {"cn": "主题", "jp": "テーマ", "kr": "테마"},
  "Dark": {"cn": "深色", "jp": "ダーク", "kr": "다크"},
  "Light": {"cn": "浅色", "jp": "ライト", "kr": "라이트"},
  "System": {"cn": "跟随系统", "jp": "システム", "kr": "시스템"},
  "Settings": {
    "cn": "设置",
    "jp": "設定",
    "kr": "설정"
  },
  "Language": {
    "cn": "语言",
    "jp": "言語",
    "kr": "언어"
  },
  "Reading mode": {
    "cn": "阅读模式",
    "jp": "表示モード",
    "kr": "읽기 모드"
  },
  "Interactive": {
    "cn": "互动阅读",
    "jp": "インタラクティブ",
    "kr": "인터랙티브"
  },
  "Full Script": {
    "cn": "完整剧本",
    "jp": "全スクリプト",
    "kr": "전체 대본"
  },
  "Debug": {
    "cn": "调试",
    "jp": "デバッグ",
    "kr": "디버그"
  },
  "Section": {
    "cn": "篇章",
    "jp": "章",
    "kr": "장"
  },
  "Category": {
    "cn": "分类",
    "jp": "カテゴリ",
    "kr": "분류"
  },
  "Story": {
    "cn": "剧情",
    "jp": "ストーリー",
    "kr": "스토리"
  },
  "Main Story": {
    "cn": "主线剧情",
    "jp": "メインストーリー",
    "kr": "메인 스토리"
  },
  "Side Stories": {
    "cn": "支线剧情",
    "jp": "サブストーリー",
    "kr": "서브 스토리"
  },
  "Reputation Quests": {
    "cn": "声望任务",
    "jp": "名声クエスト",
    "kr": "명성 퀘스트"
  },
  "Mini Stories": {
    "cn": "小故事",
    "jp": "ミニストーリー",
    "kr": "미니 스토리"
  },
  "Main Quest": {
    "cn": "主线任务",
    "jp": "メインクエスト",
    "kr": "메인 퀘스트"
  },
  "Event/Env Story": {
    "cn": "场景剧情",
    "jp": "イベント・環境ストーリー",
    "kr": "이벤트·환경 스토리"
  },
  "Gameplay Story": {
    "cn": "玩法剧情",
    "jp": "コンテンツストーリー",
    "kr": "콘텐츠 스토리"
  },
  "Timeline Story": {
    "cn": "过场剧情",
    "jp": "ムービーストーリー",
    "kr": "컷신 스토리"
  },
  "Daily Quests": {
    "cn": "日常任务",
    "jp": "デイリークエスト",
    "kr": "일일 퀘스트"
  },
  "Exploration": {
    "cn": "探索",
    "jp": "探索",
    "kr": "탐험"
  },
  "Stories": {
    "cn": "剧情",
    "jp": "ストーリー",
    "kr": "스토리"
  },
  "Special Events": {
    "cn": "特别活动",
    "jp": "特別イベント",
    "kr": "특별 이벤트"
  },
  "Starter Story": {
    "cn": "启程篇",
    "jp": "旅の始まり",
    "kr": "여정의 시작"
  },
  "World Archive": {
    "cn": "世界档案",
    "jp": "世界アーカイブ",
    "kr": "세계 아카이브"
  },
  "Items": {
    "cn": "物品",
    "jp": "アイテム",
    "kr": "아이템"
  },
  "Mail": {
    "cn": "邮件",
    "jp": "メール",
    "kr": "우편"
  },
  "Document": {
    "cn": "文献",
    "jp": "文書",
    "kr": "문서"
  },
  "Item": {
    "cn": "物品",
    "jp": "アイテム",
    "kr": "아이템"
  },
  "Document Archive": {
    "cn": "文献档案",
    "jp": "文書アーカイブ",
    "kr": "문서 아카이브"
  },
  "Item Archive": {
    "cn": "物品档案",
    "jp": "アイテムアーカイブ",
    "kr": "아이템 아카이브"
  },
  "Mail Archive": {
    "cn": "邮件档案",
    "jp": "メールアーカイブ",
    "kr": "우편 아카이브"
  },
  "Search documents": {
    "cn": "搜索文献",
    "jp": "文書を検索",
    "kr": "문서 검색"
  },
  "Search items": {
    "cn": "搜索物品",
    "jp": "アイテムを検索",
    "kr": "아이템 검색"
  },
  "Search mail": {
    "cn": "搜索邮件",
    "jp": "メールを検索",
    "kr": "우편 검색"
  },
  "Search characters": {
    "cn": "搜索角色",
    "jp": "キャラクターを検索",
    "kr": "캐릭터 검색"
  },
  "Consumables": {
    "cn": "消耗品",
    "jp": "消耗品",
    "kr": "소모품"
  },
  "Materials": {
    "cn": "材料",
    "jp": "素材",
    "kr": "재료"
  },
  "Hero Development": {
    "cn": "英雄养成",
    "jp": "英雄育成",
    "kr": "영웅 육성"
  },
  "Homestead Products": {
    "cn": "家园产物",
    "jp": "ホームの生産品",
    "kr": "홈스테드 생산품"
  },
  "Homestead Materials": {
    "cn": "家园材料",
    "jp": "ホームの素材",
    "kr": "홈스테드 재료"
  },
  "Other": {
    "cn": "其他",
    "jp": "その他",
    "kr": "기타"
  },
  "All": {
    "cn": "全部",
    "jp": "すべて",
    "kr": "전체"
  },
  "Collectible letters": {
    "cn": "可收藏信件",
    "jp": "収集できる手紙",
    "kr": "수집 편지"
  },
  "All mail": {
    "cn": "全部邮件",
    "jp": "すべてのメール",
    "kr": "전체 우편"
  },
  "Collectible letter": {
    "cn": "可收藏信件",
    "jp": "収集できる手紙",
    "kr": "수집 편지"
  },
  "No matching entries.": {
    "cn": "没有匹配的条目。",
    "jp": "該当する項目はありません。",
    "kr": "일치하는 항목이 없습니다."
  },
  "Select an entry to read it.": {
    "cn": "选择条目以阅读。",
    "jp": "項目を選択して読む。",
    "kr": "읽을 항목을 선택하세요."
  },
  "Item text": {
    "cn": "物品文本",
    "jp": "アイテムのテキスト",
    "kr": "아이템 텍스트"
  },
  "Related documents": {
    "cn": "相关文献",
    "jp": "関連文書",
    "kr": "관련 문서"
  },
  "The item icon has not been recovered.": {
    "cn": "尚未取得物品图标。",
    "jp": "アイテムのアイコンは未取得です。",
    "kr": "아이템 아이콘을 아직 확보하지 못했습니다."
  },
  "Character Files": {
    "cn": "角色档案",
    "jp": "キャラクターファイル",
    "kr": "캐릭터 자료"
  },
  "Character File": {
    "cn": "角色档案",
    "jp": "キャラクターファイル",
    "kr": "캐릭터 자료"
  },
  "Heroes": {
    "cn": "英雄",
    "jp": "英雄",
    "kr": "영웅"
  },
  "‹ All characters": {
    "cn": "‹ 全部角色",
    "jp": "‹ キャラクター一覧",
    "kr": "‹ 전체 캐릭터"
  },
  "‹ Character profile": {
    "cn": "‹ 角色档案",
    "jp": "‹ キャラクター詳細",
    "kr": "‹ 캐릭터 프로필"
  },
  "Lore": {
    "cn": "角色故事",
    "jp": "キャラクターの物語",
    "kr": "캐릭터 이야기"
  },
  "Skills & Stats": {
    "cn": "技能与属性",
    "jp": "スキル・ステータス",
    "kr": "스킬 및 능력치"
  },
  "Interactions": {
    "cn": "互动",
    "jp": "交流",
    "kr": "상호작용"
  },
  "Unit Voice Lines": {
    "cn": "角色语音",
    "jp": "キャラクターボイス",
    "kr": "캐릭터 음성"
  },
  "Resonating Hall Idles": {
    "cn": "共鸣大厅闲聊",
    "jp": "共鳴の間のボイス",
    "kr": "공명의 전당 대사"
  },
  "Affinity Gift Lines": {
    "cn": "赠礼语音",
    "jp": "プレゼントのボイス",
    "kr": "선물 대사"
  },
  "Mystical House Lines": {
    "cn": "秘闻馆语音",
    "jp": "秘話の館のボイス",
    "kr": "비화의 집 대사"
  },
  "Mystical House Idle Dialogue": {
    "cn": "秘闻馆闲聊",
    "jp": "秘話の館の日常会話",
    "kr": "비화의 집 일상 대화"
  },
  "Affinity Tales": {
    "cn": "好感故事",
    "jp": "親交の物語",
    "kr": "친밀도 이야기"
  },
  "Skins": {
    "cn": "皮肤",
    "jp": "スキン",
    "kr": "스킨"
  },
  "Mystical House Interactions": {
    "cn": "秘闻馆互动",
    "jp": "秘話の館の交流",
    "kr": "비화의 집 상호작용"
  },
  "Profile": {
    "cn": "档案",
    "jp": "プロフィール",
    "kr": "프로필"
  },
  "Faction": {
    "cn": "阵营",
    "jp": "勢力",
    "kr": "진영"
  },
  "Class": {
    "cn": "职业",
    "jp": "職業",
    "kr": "직업"
  },
  "Tank": {
    "cn": "坦克",
    "jp": "タンク",
    "kr": "탱커"
  },
  "Warrior": {
    "cn": "战士",
    "jp": "ファイター",
    "kr": "전사"
  },
  "Mage": {
    "cn": "法师",
    "jp": "メイジ",
    "kr": "마법사"
  },
  "Support": {
    "cn": "辅助",
    "jp": "サポート",
    "kr": "서포터"
  },
  "Marksman": {
    "cn": "射手",
    "jp": "アーチャー",
    "kr": "사수"
  },
  "Rogue": {
    "cn": "游侠",
    "jp": "レンジャー",
    "kr": "레인저"
  },
  "Unknown": {
    "cn": "未知",
    "jp": "不明",
    "kr": "알 수 없음"
  },
  "Loading skills and stats…": {
    "cn": "正在加载技能与属性…",
    "jp": "スキルとステータスを読み込み中…",
    "kr": "스킬과 능력치 불러오는 중…"
  },
  "Character skills could not be loaded. Please try again.": {
    "cn": "无法加载角色技能，请重试。",
    "jp": "スキルを読み込めませんでした。もう一度お試しください。",
    "kr": "스킬을 불러오지 못했습니다. 다시 시도하세요."
  },
  "Verified combat data has not been recovered for this character yet.": {
    "cn": "尚未取得此角色的已验证战斗数据。",
    "jp": "このキャラクターの検証済み戦闘データは未取得です。",
    "kr": "이 캐릭터의 검증된 전투 데이터를 아직 확보하지 못했습니다."
  },
  "Combat profile": {
    "cn": "战斗档案",
    "jp": "戦闘プロフィール",
    "kr": "전투 프로필"
  },
  "Base config coefficients": {
    "cn": "基础配置系数",
    "jp": "基礎設定の係数",
    "kr": "기본 설정 계수"
  },
  "Base stats": {
    "cn": "基础属性",
    "jp": "基礎ステータス",
    "kr": "기본 능력치"
  },
  "Exact config rows; naked hero": {
    "cn": "原始配置数据；无装备英雄",
    "jp": "設定値に基づく装備なしの英雄",
    "kr": "원본 설정 기준 · 장비 미착용 영웅"
  },
  "Skills": {
    "cn": "技能",
    "jp": "スキル",
    "kr": "스킬"
  },
  "Ultimate": {
    "cn": "终极技能",
    "jp": "必殺技",
    "kr": "궁극기"
  },
  "Skill": {
    "cn": "技能",
    "jp": "スキル",
    "kr": "스킬"
  },
  "Exclusive Skill": {
    "cn": "专属技能",
    "jp": "専用スキル",
    "kr": "전용 스킬"
  },
  "Awakening": {
    "cn": "觉醒",
    "jp": "覚醒",
    "kr": "각성"
  },
  "Hero Focus": {
    "cn": "英雄专精",
    "jp": "英雄の覚醒",
    "kr": "영웅 집중"
  },
  "Basic Attack": {
    "cn": "普通攻击",
    "jp": "通常攻撃",
    "kr": "일반 공격"
  },
  "Exclusive unlock": {
    "cn": "解锁专属技能",
    "jp": "専用スキル解放",
    "kr": "전용 스킬 해제"
  },
  "Exclusive Equipment": {
    "cn": "专属装备",
    "jp": "専用装備",
    "kr": "전용 장비"
  },
  "Signature equipment": {
    "cn": "专属装备",
    "jp": "専用装備",
    "kr": "전용 장비"
  },
  "Equipment level": {
    "cn": "装备等级",
    "jp": "装備レベル",
    "kr": "장비 레벨"
  },
  "Progression": {
    "cn": "成长阶段",
    "jp": "成長段階",
    "kr": "성장 단계"
  },
  "Hero level": {
    "cn": "英雄等级",
    "jp": "英雄レベル",
    "kr": "영웅 레벨"
  },
  "Quality": {
    "cn": "品质",
    "jp": "ランク",
    "kr": "등급"
  },
  "Level slider": {
    "cn": "等级滑块",
    "jp": "レベルスライダー",
    "kr": "레벨 슬라이더"
  },
  "Proficiency": {
    "cn": "熟练度",
    "jp": "熟練度",
    "kr": "숙련도"
  },
  "HP": {
    "cn": "生命值",
    "jp": "HP",
    "kr": "HP"
  },
  "ATK": {
    "cn": "攻击力",
    "jp": "攻撃力",
    "kr": "공격력"
  },
  "Physical DEF": {
    "cn": "物理防御",
    "jp": "物理防御",
    "kr": "물리 방어력"
  },
  "Magic DEF": {
    "cn": "魔法防御",
    "jp": "魔法防御",
    "kr": "마법 방어력"
  },
  "Vitality": {
    "cn": "受愈",
    "jp": "治癒",
    "kr": "활력"
  },
  "Healing": {
    "cn": "治愈",
    "jp": "治療",
    "kr": "치유"
  },
  "Attack Speed": {
    "cn": "攻击速度",
    "jp": "攻撃速度",
    "kr": "공격 속도"
  },
  "Life Drain": {
    "cn": "吸血",
    "jp": "吸収",
    "kr": "흡혈"
  },
  "Crit": {
    "cn": "暴击",
    "jp": "クリティカル",
    "kr": "치명타"
  },
  "Crit Resist": {
    "cn": "暴击抵抗",
    "jp": "クリティカル耐性",
    "kr": "치명타 저항"
  },
  "Haste": {
    "cn": "急速",
    "jp": "速度",
    "kr": "가속"
  },
  "Block": {
    "cn": "格挡",
    "jp": "ブロック",
    "kr": "막기"
  },
  "Penetration": {
    "cn": "穿透",
    "jp": "貫通",
    "kr": "관통"
  },
  "Max Quality": {
    "cn": "最高品质",
    "jp": "最高ランク",
    "kr": "최고 등급"
  },
  "Damage Type": {
    "cn": "伤害类型",
    "jp": "ダメージタイプ",
    "kr": "피해 유형"
  },
  "Range": {
    "cn": "攻击距离",
    "jp": "攻撃範囲",
    "kr": "공격 범위"
  },
  "Melee": {
    "cn": "近战",
    "jp": "近接",
    "kr": "근접"
  },
  "Ranged": {
    "cn": "远程",
    "jp": "遠距離",
    "kr": "원거리"
  },
  "Physical": {
    "cn": "物理",
    "jp": "物理",
    "kr": "물리"
  },
  "Magic": {
    "cn": "魔法",
    "jp": "魔法",
    "kr": "마법"
  },
  "Default Outfit": {
    "cn": "默认外观",
    "jp": "初期衣装",
    "kr": "기본 의상"
  },
  "Skin": {
    "cn": "皮肤",
    "jp": "スキン",
    "kr": "스킨"
  },
  "Unnamed Outfit": {
    "cn": "未命名外观",
    "jp": "名称未設定の衣装",
    "kr": "이름 없는 의상"
  },
  "Artwork unavailable": {
    "cn": "暂无立绘",
    "jp": "イラスト未取得",
    "kr": "일러스트 없음"
  },
  "Voice": {
    "cn": "语音",
    "jp": "ボイス",
    "kr": "음성"
  },
  "Idle": {
    "cn": "闲聊",
    "jp": "待機ボイス",
    "kr": "대기 대사"
  },
  "Gift": {
    "cn": "赠礼",
    "jp": "プレゼント",
    "kr": "선물"
  },
  "[Official caption unavailable]": {
    "cn": "[暂无官方字幕]",
    "jp": "[公式字幕なし]",
    "kr": "[공식 자막 없음]"
  },
  "Play voice": {
    "cn": "播放语音",
    "jp": "ボイスを再生",
    "kr": "음성 재생"
  },
  "Machine translation": {
    "cn": "机器翻译",
    "jp": "機械翻訳",
    "kr": "기계 번역"
  },
  "Community translation": {
    "cn": "社区翻译",
    "jp": "コミュニティ翻訳",
    "kr": "커뮤니티 번역"
  },
  "Chinese title fallback": {
    "cn": "暂无本地化标题，显示中文",
    "jp": "翻訳未収録のため中国語タイトルを表示",
    "kr": "번역이 없어 중국어 제목을 표시합니다"
  },
  "Fallback text": {
    "cn": "备用文本",
    "jp": "代替テキスト",
    "kr": "대체 텍스트"
  },
  "Saved AI-generated translation. Official localization is unavailable.": {
    "cn": "已保存的AI翻译，暂无官方本地化文本。",
    "jp": "保存済みのAI翻訳です。公式翻訳は未収録です。",
    "kr": "저장된 AI 번역입니다. 공식 번역이 없습니다."
  },
  "This story contains machine-translated dialogue.": {
    "cn": "本段剧情包含机器翻译对话。",
    "jp": "このストーリーには機械翻訳の会話が含まれます。",
    "kr": "이 스토리에는 기계 번역된 대사가 포함되어 있습니다."
  },
  "Continue": {
    "cn": "继续",
    "jp": "続ける",
    "kr": "계속"
  },
  "Undo last choice": {
    "cn": "撤销上次选择",
    "jp": "直前の選択を戻す",
    "kr": "마지막 선택 취소"
  },
  "Restart story": {
    "cn": "重新开始剧情",
    "jp": "ストーリーを最初から読む",
    "kr": "스토리 다시 시작"
  },
  "Copy link to current node": {
    "cn": "复制当前位置链接",
    "jp": "現在位置のリンクをコピー",
    "kr": "현재 위치 링크 복사"
  },
  "Copied": {
    "cn": "已复制",
    "jp": "コピーしました",
    "kr": "복사됨"
  },
  "‹ Previous story": {
    "cn": "‹ 上一段剧情",
    "jp": "‹ 前のストーリー",
    "kr": "‹ 이전 스토리"
  },
  "Next story ›": {
    "cn": "下一段剧情 ›",
    "jp": "次のストーリー ›",
    "kr": "다음 스토리 ›"
  },
  "Show machine translation": {
    "cn": "显示机器翻译",
    "jp": "機械翻訳を表示",
    "kr": "기계 번역 표시"
  },
  "Show debug information": {
    "cn": "显示调试信息",
    "jp": "デバッグ情報を表示",
    "kr": "디버그 정보 표시"
  },
  "Font size": {
    "cn": "字号",
    "jp": "文字サイズ",
    "kr": "글자 크기"
  },
  "Player name": {
    "cn": "玩家名称",
    "jp": "プレイヤー名",
    "kr": "플레이어 이름"
  },
  "Player gender": {
    "cn": "玩家性别",
    "jp": "プレイヤーの性別",
    "kr": "플레이어 성별"
  },
  "Male": {
    "cn": "男性",
    "jp": "男性",
    "kr": "남성"
  },
  "Female": {
    "cn": "女性",
    "jp": "女性",
    "kr": "여성"
  },
  "Show both": {
    "cn": "全部显示",
    "jp": "両方表示",
    "kr": "모두 표시"
  },
  "In this story": {
    "cn": "本段剧情",
    "jp": "このストーリー",
    "kr": "이 스토리"
  },
  "Reader sections": {
    "cn": "阅读栏目",
    "jp": "閲覧セクション",
    "kr": "읽기 섹션"
  },
  "Story navigation": {
    "cn": "剧情导航",
    "jp": "ストーリーナビゲーション",
    "kr": "스토리 탐색"
  },
  "Archive type": {
    "cn": "档案类型",
    "jp": "アーカイブの種類",
    "kr": "아카이브 종류"
  },
  "Item category": {
    "cn": "物品分类",
    "jp": "アイテムカテゴリ",
    "kr": "아이템 분류"
  },
  "Mail collection": {
    "cn": "信件收藏",
    "jp": "手紙のコレクション",
    "kr": "우편 모음"
  },
  "Archive entries": {
    "cn": "档案条目",
    "jp": "アーカイブ項目",
    "kr": "아카이브 항목"
  },
  "Character sections": {
    "cn": "角色栏目",
    "jp": "キャラクターの項目",
    "kr": "캐릭터 섹션"
  },
  "Story outline": {
    "cn": "剧情目录",
    "jp": "ストーリー目次",
    "kr": "스토리 목차"
  },
  "Story metadata": {
    "cn": "剧情信息",
    "jp": "ストーリー情報",
    "kr": "스토리 정보"
  },
  "Sources": {
    "cn": "来源",
    "jp": "出典",
    "kr": "출처"
  },
  "Close full portrait": {
    "cn": "关闭立绘",
    "jp": "立ち絵を閉じる",
    "kr": "일러스트 닫기"
  },
  "Narration": {
    "cn": "旁白",
    "jp": "ナレーション",
    "kr": "나레이션"
  },
  "Black screen text": {
    "cn": "黑屏文字",
    "jp": "暗転中のテキスト",
    "kr": "암전 텍스트"
  },
  "Other on-screen cast": {
    "cn": "其他在场角色",
    "jp": "画面内の他の登場人物",
    "kr": "화면의 다른 등장인물"
  },
  "Cinematic": {
    "cn": "过场动画",
    "jp": "ムービー",
    "kr": "컷신"
  },
  "Cinematic scene": {
    "cn": "过场场景",
    "jp": "ムービーシーン",
    "kr": "컷신 장면"
  },
  "Picture": {
    "cn": "图片",
    "jp": "画像",
    "kr": "그림"
  },
  "No linked quest summary yet.": {
    "cn": "暂无关联任务概要。",
    "jp": "関連クエストのあらすじは未収録です。",
    "kr": "연결된 퀘스트 요약이 없습니다."
  },
  "These objectives can be completed in either order.": {
    "cn": "这些目标可以按任意顺序完成。",
    "jp": "これらの目標は好きな順序で達成できます。",
    "kr": "이 목표는 순서와 관계없이 완료할 수 있습니다."
  },
  "These fishing spots can be visited in either order.": {
    "cn": "这些钓点可以按任意顺序前往。",
    "jp": "これらの釣り場は好きな順序で訪れることができます。",
    "kr": "이 낚시터는 순서와 관계없이 방문할 수 있습니다."
  },
  "Inspection points": {
    "cn": "调查点",
    "jp": "調査ポイント",
    "kr": "조사 지점"
  },
  "Inspection": {
    "cn": "调查",
    "jp": "調査",
    "kr": "조사"
  },
  "Inspection complete": {
    "cn": "调查完成",
    "jp": "調査完了",
    "kr": "조사 완료"
  },
  "Continue story": {
    "cn": "继续剧情",
    "jp": "ストーリーを続ける",
    "kr": "스토리 계속"
  },
  "Conclusion": {
    "cn": "结论",
    "jp": "結論",
    "kr": "결론"
  },
  "More enemy lineups": {
    "cn": "更多敌方阵容",
    "jp": "他の敵編成",
    "kr": "다른 적 편성"
  },
  "Enemies": {
    "cn": "敌人",
    "jp": "敵",
    "kr": "적"
  },
  "Available after viewing the other options": {
    "cn": "查看其他选项后解锁",
    "jp": "他の選択肢を見た後に解放",
    "kr": "다른 선택지를 확인하면 해제됩니다"
  },
  "This choice affects later stories. Changing it recalculates the storyline.": {
    "cn": "此选择会影响后续剧情，修改后将重新计算剧情路线。",
    "jp": "この選択は後のストーリーに影響します。変更するとルートが再計算されます。",
    "kr": "이 선택은 이후 스토리에 영향을 줍니다. 변경하면 이야기를 다시 계산합니다."
  },
  "Close result": {
    "cn": "关闭结果",
    "jp": "結果を閉じる",
    "kr": "결과 닫기"
  },
  "View result": {
    "cn": "查看结果",
    "jp": "結果を見る",
    "kr": "결과 보기"
  },
  "Change catch": {
    "cn": "更改渔获",
    "jp": "釣果を変更",
    "kr": "낚시 결과 변경"
  },
  "Fishing results": {
    "cn": "钓鱼结果",
    "jp": "釣りの結果",
    "kr": "낚시 결과"
  },
  "Fishing completed": {
    "cn": "钓鱼完成",
    "jp": "釣り完了",
    "kr": "낚시 완료"
  },
  "Possible catch": {
    "cn": "可能的渔获",
    "jp": "釣れる可能性のある魚",
    "kr": "가능한 낚시 결과"
  },
  "Fish caught": {
    "cn": "钓到鱼了",
    "jp": "魚を釣った",
    "kr": "물고기 획득"
  },
  "Fish": {
    "cn": "鱼",
    "jp": "魚",
    "kr": "물고기"
  },
  "Alchemy complete": {
    "cn": "炼金完成",
    "jp": "錬金完了",
    "kr": "연금 완료"
  },
  "Medicine prepared": {
    "cn": "药品调配完成",
    "jp": "薬の調合完了",
    "kr": "약 조제 완료"
  },
  "Item obtained": {
    "cn": "获得物品",
    "jp": "アイテム獲得",
    "kr": "아이템 획득"
  },
  "Activity": {
    "cn": "活动",
    "jp": "アクティビティ",
    "kr": "활동"
  },
  "Clues": {
    "cn": "线索",
    "jp": "手がかり",
    "kr": "단서"
  },
  "Connect clues to continue the story.": {
    "cn": "关联线索以继续剧情。",
    "jp": "手がかりを組み合わせてストーリーを進めてください。",
    "kr": "단서를 조합해 스토리를 진행하세요."
  },
  "Default combination — change it to view a different order.": {
    "cn": "当前为默认组合，修改后可查看其他顺序。",
    "jp": "初期の組み合わせです。変更すると別の順序を確認できます。",
    "kr": "기본 조합입니다. 변경하면 다른 순서를 볼 수 있습니다."
  },
  "Choose treatment outcome": {
    "cn": "选择治疗结果",
    "jp": "治療の結果を選ぶ",
    "kr": "치료 결과 선택"
  },
  "Change combination": {
    "cn": "更改组合",
    "jp": "組み合わせを変更",
    "kr": "조합 변경"
  },
  "Connect clues": {
    "cn": "关联线索",
    "jp": "手がかりを組み合わせる",
    "kr": "단서 조합"
  },
  "Choose outcome": {
    "cn": "选择结果",
    "jp": "結果を選ぶ",
    "kr": "결과 선택"
  },
  "Switch a choice to view a different storyline. Later content will be recalculated.": {
    "cn": "切换选择以查看其他剧情路线，后续内容将重新计算。",
    "jp": "選択を切り替えると別のルートを確認できます。以降の内容は再計算されます。",
    "kr": "선택을 바꾸면 다른 이야기를 볼 수 있습니다. 이후 내용은 다시 계산됩니다."
  },
  "Assumed · skipped earlier choice": {
    "cn": "推定选择 · 跳过了此前选择",
    "jp": "仮の選択 · 以前の選択をスキップ",
    "kr": "가정한 선택 · 이전 선택 건너뜀"
  },
  "Your saved choice": {
    "cn": "已保存的选择",
    "jp": "保存した選択",
    "kr": "저장된 선택"
  },
  "Use this choice": {
    "cn": "使用此选择",
    "jp": "この選択を使う",
    "kr": "이 선택 적용"
  },
  "Confirm earlier progress to unlock its continuations. Completion is saved only when you confirm it here.": {
    "cn": "确认此前进度以解锁后续剧情。仅在此处确认后才保存完成状态。",
    "jp": "以前の進行状況を確認すると続きが解放されます。ここで確認したときのみ完了状態が保存されます。",
    "kr": "이전 진행 상황을 확인하면 후속 스토리가 해제됩니다. 여기서 확인해야 완료 상태가 저장됩니다."
  },
  "Earlier story": {
    "cn": "此前剧情",
    "jp": "以前のストーリー",
    "kr": "이전 스토리"
  },
  "Save progress": {
    "cn": "保存进度",
    "jp": "進行状況を保存",
    "kr": "진행 상황 저장"
  },
  "Export story state": {
    "cn": "导出剧情状态",
    "jp": "ストーリーの状態をエクスポート",
    "kr": "스토리 상태 내보내기"
  },
  "Browser storage is unavailable. Choices will last for this visit only.": {
    "cn": "浏览器存储不可用，选择仅在本次访问期间保留。",
    "jp": "ブラウザーの保存機能を利用できません。選択は今回の閲覧中のみ保持されます。",
    "kr": "브라우저 저장소를 사용할 수 없습니다. 이번 방문 중에만 선택이 유지됩니다."
  },
  "Inspect remaining points": {
    "cn": "调查剩余地点",
    "jp": "残りのポイントを調べる",
    "kr": "남은 지점 조사"
  },
  "Reveal to next choice": {
    "cn": "显示至下个选择",
    "jp": "次の選択肢まで表示",
    "kr": "다음 선택지까지 표시"
  },
  "Next story beat": {
    "cn": "下一段剧情",
    "jp": "次のストーリーへ",
    "kr": "다음 스토리 구간"
  },
  "End": {
    "cn": "结束",
    "jp": "終了",
    "kr": "끝"
  },
  "Choose an option": {
    "cn": "请选择",
    "jp": "選択してください",
    "kr": "선택하세요"
  },
  "Undo inspection": {
    "cn": "撤销调查",
    "jp": "調査を戻す",
    "kr": "조사 취소"
  },
  "Loading...": {
    "cn": "正在加载…",
    "jp": "読み込み中…",
    "kr": "불러오는 중…"
  },
  "Loading story": {
    "cn": "正在加载剧情",
    "jp": "ストーリーを読み込み中",
    "kr": "스토리 불러오는 중"
  },
  "{n} characters": {
    "cn": "{n}位角色",
    "jp": "{n}人のキャラクター",
    "kr": "캐릭터 {n}명"
  },
  "{n} of {total} documents": {
    "cn": "文献 {n} / {total}",
    "jp": "文書 {n} / {total}件",
    "kr": "문서 {n} / {total}개"
  },
  "{n} of {total} collectible letters": {
    "cn": "收藏信件 {n} / {total}",
    "jp": "収集できる手紙 {n} / {total}通",
    "kr": "수집 편지 {n} / {total}개"
  },
  "{n} of {total} mail templates": {
    "cn": "邮件模板 {n} / {total}",
    "jp": "メールテンプレート {n} / {total}件",
    "kr": "우편 양식 {n} / {total}개"
  },
  "{n} of {total} entries | {items} items | {images} images": {
    "cn": "条目 {n} / {total} | 物品 {items} | 图片 {images}",
    "jp": "項目 {n} / {total}件 | アイテム {items}件 | 画像 {images}枚",
    "kr": "항목 {n} / {total}개 | 아이템 {items}개 | 이미지 {images}개"
  },
  "{n} displayed entries": {
    "cn": "显示{n}个条目",
    "jp": "{n}件の項目を表示",
    "kr": "항목 {n}개 표시"
  },
  "Availability: {text}": {
    "cn": "获取方式：{text}",
    "jp": "入手方法：{text}",
    "kr": "획득 방법: {text}"
  },
  "Story {n}": {
    "cn": "剧情 {n}",
    "jp": "ストーリー {n}",
    "kr": "스토리 {n}"
  },
  "Chapter {n}": {
    "cn": "章节 {n}",
    "jp": "チャプター {n}",
    "kr": "챕터 {n}"
  },
  "Level {n}": {
    "cn": "等级 {n}",
    "jp": "レベル {n}",
    "kr": "레벨 {n}"
  },
  "Tier {n}": {
    "cn": "品阶 {n}",
    "jp": "ランク {n}",
    "kr": "등급 {n}"
  },
  "Awakening {n}": {
    "cn": "觉醒 {n}",
    "jp": "覚醒 {n}",
    "kr": "각성 {n}"
  },
  "Exclusive +{n}": {
    "cn": "专属 +{n}",
    "jp": "専用 +{n}",
    "kr": "전용 +{n}"
  },
  "Focus +{n}": {
    "cn": "专精 +{n}",
    "jp": "覚醒 +{n}",
    "kr": "집중 +{n}"
  },
  "Refinement {n}": {
    "cn": "精炼 {n}",
    "jp": "精錬 {n}",
    "kr": "정련 {n}"
  },
  "Cooldown {n}s": {
    "cn": "冷却 {n}秒",
    "jp": "クールタイム {n}秒",
    "kr": "쿨타임 {n}초"
  },
  "Energy {n}": {
    "cn": "能量 {n}",
    "jp": "エネルギー {n}",
    "kr": "에너지 {n}"
  },
  "{n} upgrades": {
    "cn": "{n}次升级",
    "jp": "{n}段階の強化",
    "kr": "강화 {n}단계"
  },
  "{n} recovered": {
    "cn": "已取得{n}项",
    "jp": "{n}件取得済み",
    "kr": "{n}개 확보"
  },
  "Play {label}": {
    "cn": "播放{label}",
    "jp": "{label}を再生",
    "kr": "{label} 재생"
  },
  "Pause {label}": {
    "cn": "暂停{label}",
    "jp": "{label}を一時停止",
    "kr": "{label} 일시정지"
  },
  "View full pose for {name}": {
    "cn": "查看{name}的完整立绘",
    "jp": "{name}の立ち絵全体を表示",
    "kr": "{name} 전체 일러스트 보기"
  },
  "Point {n}": {
    "cn": "地点 {n}",
    "jp": "ポイント {n}",
    "kr": "지점 {n}"
  },
  "Read Point {n}": {
    "cn": "阅读地点 {n}",
    "jp": "ポイント {n}を読む",
    "kr": "지점 {n} 읽기"
  },
  "Inspect Point {n}": {
    "cn": "调查地点 {n}",
    "jp": "ポイント {n}を調べる",
    "kr": "지점 {n} 조사"
  },
  "Replay Point {n}": {
    "cn": "重看地点 {n}",
    "jp": "ポイント {n}をもう一度見る",
    "kr": "지점 {n} 다시 보기"
  },
  "All {n} points shown below": {
    "cn": "全部{n}个地点见下方",
    "jp": "全{n}ポイントを以下に表示",
    "kr": "지점 {n}개가 아래에 표시됩니다"
  },
  "All {n} points read": {
    "cn": "已阅读全部{n}个地点",
    "jp": "全{n}ポイントを確認済み",
    "kr": "지점 {n}개 확인 완료"
  },
  "{n} of {total} points read · Choose any point": {
    "cn": "已阅读{n}/{total}个地点 · 可任选地点",
    "jp": "{total}ポイント中{n}確認済み · 好きなポイントを選択",
    "kr": "{total}개 중 {n}개 확인 · 지점을 자유롭게 선택하세요"
  },
  "Story progress · {n} saved choices": {
    "cn": "剧情进度 · 已保存{n}个选择",
    "jp": "進行状況 · {n}件の選択を保存済み",
    "kr": "스토리 진행 · 선택 {n}개 저장됨"
  },
  "Story choices · {n} saved": {
    "cn": "剧情选择 · 已保存{n}项",
    "jp": "ストーリーの選択 · {n}件保存済み",
    "kr": "스토리 선택 · {n}개 저장됨"
  },
  "Saved choice {n}": {
    "cn": "已保存的选择 {n}",
    "jp": "保存した選択 {n}",
    "kr": "저장된 선택 {n}"
  },
  "Could not open mail: {error}": {
    "cn": "无法打开邮件：{error}",
    "jp": "メールを開けませんでした：{error}",
    "kr": "우편을 열지 못했습니다: {error}"
  },
  "Could not load this content: {error}": {
    "cn": "无法加载此内容：{error}",
    "jp": "このコンテンツを読み込めませんでした：{error}",
    "kr": "콘텐츠를 불러오지 못했습니다: {error}"
  },
  "Attack style": {
    "cn": "攻击方式",
    "jp": "攻撃スタイル",
    "kr": "공격 방식"
  },
  "Damage": {
    "cn": "伤害类型",
    "jp": "ダメージ",
    "kr": "피해 유형"
  },
  "Growth": {
    "cn": "成长",
    "jp": "成長",
    "kr": "성장"
  },
  "Max quality tier": {
    "cn": "最高品阶",
    "jp": "最高ランク",
    "kr": "최고 등급"
  },
  "Starting energy": {
    "cn": "初始能量",
    "jp": "初期エネルギー",
    "kr": "시작 에너지"
  },
  "Standard progression": {
    "cn": "常规成长",
    "jp": "通常の成長",
    "kr": "일반 성장"
  },
  "Episode progression": {
    "cn": "赛季成长",
    "jp": "シーズンの成長",
    "kr": "시즌 성장"
  },
  "The calculator reconstructs naked config stats at exact table-backed levels. It deliberately excludes equipment, charms, mastery, artifacts, mode normalization, and account bonuses, so roster-panel totals can differ.": {
    "cn": "计算器根据配置表中的精确等级还原无装备属性，不计入装备、魔法饰品、专精、神器、模式平衡与账号加成，因此可能与游戏内英雄面板不同。",
    "jp": "設定表に記録されたレベルごとの装備なしの値を計算します。装備、魔法のチャーム、熟練度、アーティファクト、モード補正、アカウントのボーナスを含まないため、ゲーム内の表示値とは異なる場合があります。",
    "kr": "설정표의 정확한 레벨별 장비 미착용 능력치를 계산합니다. 장비, 마법 부적, 숙련도, 아티팩트, 모드 보정, 계정 보너스는 포함하지 않아 게임 내 영웅 화면의 수치와 다를 수 있습니다."
  },
  "Values are cumulative at the selected equipment level. *_PR fields are rendered as percentage-point bonuses from their field convention; secondary attributes are config points.": {
    "cn": "数值为所选装备等级的累计加成。*_PR字段按字段约定显示为百分比加成，次要属性为配置点数。",
    "jp": "選択した装備レベルの累積ボーナスです。*_PR項目はフィールドの規則に従ってパーセント加算として表示し、その他の属性は設定上のポイントで表示します。",
    "kr": "선택한 장비 레벨의 누적 보너스입니다. *_PR 필드는 필드 규칙에 따라 퍼센트 포인트 보너스로, 보조 능력치는 설정 포인트로 표시합니다."
  },
  "Change outcome": {
    "cn": "更改结果",
    "jp": "結果を変更",
    "kr": "결과 변경"
  },
  "Medicine is prepared here.": {
    "cn": "在此处调配药品。",
    "jp": "ここで薬を調合します。",
    "kr": "여기서 약을 조제합니다."
  },
  "Prepare medicine and treat the patient here. Choose the treatment outcome to continue the story.": {
    "cn": "在此处调配药品并治疗患者。选择治疗结果以继续剧情。",
    "jp": "ここで薬を調合し、患者を治療します。治療の結果を選ぶとストーリーが進みます。",
    "kr": "여기서 약을 조제하고 환자를 치료합니다. 치료 결과를 선택하면 스토리가 진행됩니다."
  },
  "This activity takes place here. Select an outcome to continue the story.": {
    "cn": "在此处进行活动。选择结果以继续剧情。",
    "jp": "ここでアクティビティが行われます。結果を選ぶとストーリーが進みます。",
    "kr": "여기서 활동이 진행됩니다. 결과를 선택하면 스토리가 진행됩니다."
  },
  "Default outcome — change it to view another route.": {
    "cn": "当前为默认结果，修改后可查看其他路线。",
    "jp": "初期の結果です。変更すると別のルートを確認できます。",
    "kr": "기본 결과입니다. 변경하면 다른 경로를 볼 수 있습니다."
  },
  "Assumed first available option — you can change it.": {
    "cn": "当前推定为第一个可用选项，可进行修改。",
    "jp": "最初に選べる選択肢を仮に使用しています。変更できます。",
    "kr": "첫 번째 가능한 선택지를 임시로 적용했습니다. 변경할 수 있습니다."
  },
  "Your choice is saved for later stories.": {
    "cn": "此选择已保存，将用于后续剧情。",
    "jp": "この選択は後のストーリー用に保存されました。",
    "kr": "이후 스토리를 위해 선택이 저장되었습니다."
  },
  "This continuation needs additional story state.": {
    "cn": "后续剧情需要更多进度信息。",
    "jp": "続きには追加の進行情報が必要です。",
    "kr": "계속하려면 추가 스토리 진행 정보가 필요합니다."
  },
  "Translation reference": {
    "cn": "翻译参考",
    "jp": "翻訳の参考",
    "kr": "번역 참고"
  },
  "Missing": {
    "cn": "缺失",
    "jp": "未収録",
    "kr": "누락"
  },
  "Official wording from the document archive.": {
    "cn": "采用文献档案中的官方译文。",
    "jp": "文書アーカイブの公式訳を使用しています。",
    "kr": "문서 아카이브의 공식 번역을 사용합니다."
  },
  "Chinese source fallback. Official localization is unavailable.": {
    "cn": "暂无官方本地化文本，显示中文原文。",
    "jp": "公式翻訳が未収録のため、中国語の原文を表示しています。",
    "kr": "공식 번역이 없어 중국어 원문을 표시합니다."
  },
  "No source text was found.": {
    "cn": "未找到原文。",
    "jp": "原文が見つかりません。",
    "kr": "원문을 찾을 수 없습니다."
  },
  "Battle": {
    "cn": "战斗",
    "jp": "バトル",
    "kr": "전투"
  },
  "Encounter": {
    "cn": "遭遇",
    "jp": "遭遇",
    "kr": "조우"
  },
  "Episode {n}": {
    "cn": "第{n}篇",
    "jp": "エピソード {n}",
    "kr": "에피소드 {n}"
  },
  "Mail {n}": {
    "cn": "邮件 {n}",
    "jp": "メール {n}",
    "kr": "우편 {n}"
  },
  "Item {n}": {
    "cn": "物品 {n}",
    "jp": "アイテム {n}",
    "kr": "아이템 {n}"
  },
  "{n} stars": {
    "cn": "{n}星",
    "jp": "星{n}",
    "kr": "{n}성"
  },
  "{name} · Level {n} · {quality}": {
    "cn": "{name} · 等级{n} · {quality}",
    "jp": "{name} · レベル{n} · {quality}",
    "kr": "{name} · 레벨 {n} · {quality}"
  },
  "{name} cumulative stats": {
    "cn": "{name} 累计属性",
    "jp": "{name}の累積ステータス",
    "kr": "{name} 누적 능력치"
  },
  "Incomplete profile. Unit {n} is disabled in the game data. This entry shows the recovered biography and dialogue; skills and stats are not yet recovered for this record.": {
    "cn": "档案尚不完整。单位{n}在游戏数据中未启用。此处显示已取得的传记与对话，尚无技能与属性。",
    "jp": "未完成のプロフィールです。ユニット{n}はゲームデータで無効になっています。取得済みの経歴と会話を表示します。スキルとステータスは未取得です。",
    "kr": "미완성 프로필입니다. 유닛 {n}은 게임 데이터에서 비활성화되어 있습니다. 확보한 전기와 대사를 표시하며 스킬과 능력치는 아직 없습니다."
  },
  "Preview profile. Not recovered yet: {fields}.": {
    "cn": "预览档案。尚未取得：{fields}。",
    "jp": "プレビューです。未取得の項目：{fields}。",
    "kr": "미리보기 프로필입니다. 아직 확보하지 못한 항목: {fields}."
  },
  "Replay": {
    "cn": "重看",
    "jp": "再確認",
    "kr": "다시 보기"
  },
  "Current speaker: {name}": {
    "cn": "当前发言者：{name}",
    "jp": "現在の話者：{name}",
    "kr": "현재 화자: {name}"
  },
  "On-screen cast: {name}": {
    "cn": "在场角色：{name}",
    "jp": "画面内の登場人物：{name}",
    "kr": "화면의 등장인물: {name}"
  },
  "Deploy": {
    "cn": "上阵",
    "jp": "出陣",
    "kr": "출전"
  },
  "Upgrade": {
    "cn": "升级",
    "jp": "レベルアップ",
    "kr": "레벨 상승"
  },
  "Defeated": {
    "cn": "战败",
    "jp": "敗北",
    "kr": "패배"
  },
  "Victory": {
    "cn": "胜利",
    "jp": "勝利",
    "kr": "승리"
  },
  "First Recruitment": {
    "cn": "初次招募",
    "jp": "初回募集",
    "kr": "첫 모집"
  },
  "Resonating Hall Idle": {
    "cn": "共鸣大厅闲聊",
    "jp": "共鳴の間のボイス",
    "kr": "공명의 전당 대사"
  },
  "Liked Gift": {
    "cn": "喜爱的礼物",
    "jp": "好きなプレゼント",
    "kr": "좋아하는 선물"
  },
  "Disliked Gift": {
    "cn": "不喜欢的礼物",
    "jp": "苦手なプレゼント",
    "kr": "싫어하는 선물"
  },
  "Affinity Gift": {
    "cn": "好感赠礼",
    "jp": "親交のプレゼント",
    "kr": "친밀도 선물"
  },
  "Advanced effect": {
    "cn": "进阶效果",
    "jp": "上級効果",
    "kr": "고급 효과"
  },
  "PvP damage boost": {
    "cn": "竞技场伤害加成",
    "jp": "アリーナのダメージ増幅",
    "kr": "아레나 피해 증폭"
  },
  "PvP damage reduction": {
    "cn": "竞技场伤害减免",
    "jp": "アリーナのダメージ軽減",
    "kr": "아레나 피해 감소"
  },
  "Lv. {n}": {
    "cn": "{n}级",
    "jp": "Lv. {n}",
    "kr": "Lv. {n}"
  },
  " (max)": {
    "cn": "（最高）",
    "jp": "（最大）",
    "kr": " (최대)"
  },
  "Levels +0 to +25 · Refinement 1–4": {
    "cn": "等级 +0 至 +25 · 精炼 1–4",
    "jp": "レベル +0～+25 · 精錬1～4",
    "kr": "레벨 +0~+25 · 정련 1~4"
  },
  "Unit {n} · Skill shard {shard}": {
    "cn": "单位 {n} · 技能分片 {shard}",
    "jp": "ユニット {n} · スキルデータ {shard}",
    "kr": "유닛 {n} · 스킬 데이터 {shard}"
  },
  "Hero {n} · config level {level}": {
    "cn": "英雄 {n} · 配置等级 {level}",
    "jp": "英雄 {n} · 設定レベル {level}",
    "kr": "영웅 {n} · 설정 레벨 {level}"
  },
  "Part {n}/{total}": {
    "cn": "第{n}/{total}部分",
    "jp": "パート {n}/{total}",
    "kr": "구간 {n}/{total}"
  },
  "combination": {
    "cn": "组合",
    "jp": "組み合わせ",
    "kr": "조합"
  },
  "outcome": {
    "cn": "结果",
    "jp": "結果",
    "kr": "결과"
  },
  "reader completion": {
    "cn": "阅读完成状态",
    "jp": "閲覧完了状態",
    "kr": "읽기 완료 상태"
  }
};
  Object.assign(messages, {
  "Main + seasonal": {
    "cn": "主线等级 + 赛季等级",
    "jp": "メイン＋シーズン",
    "kr": "메인 + 시즌"
  },
  "Main level only": {
    "cn": "仅主线等级",
    "jp": "メインレベルのみ",
    "kr": "메인 레벨만"
  },
  "Main level": {
    "cn": "主线等级",
    "jp": "メインレベル",
    "kr": "메인 레벨"
  },
  "Seasonal level": {
    "cn": "赛季等级",
    "jp": "シーズンレベル",
    "kr": "시즌 레벨"
  },
  "In-game level": {
    "cn": "游戏显示等级",
    "jp": "ゲーム内表示レベル",
    "kr": "게임 표시 레벨"
  },
  "Season Lv. {level} · main {main}": {
    "cn": "赛季等级 {level} · 主线 {main}",
    "jp": "シーズンLv. {level} · メイン {main}",
    "kr": "시즌 Lv. {level} · 메인 {main}"
  },
  "Includes normal Lv. {n} equipment. Seasonal equipment, exclusive equipment, charms, and other bonuses are excluded.": {
    "cn": "包含{n}级常规装备。不含赛季装备、专属装备、魔饰及其他加成。",
    "jp": "通常装備Lv. {n}を含みます。シーズン装備、専用装備、チャーム、その他のボーナスは含みません。",
    "kr": "일반 장비 {n}레벨을 포함합니다. 시즌 장비·전용 장비·주문석 및 기타 보너스는 제외합니다."
  },
  "All equipment, charms, and other bonuses are excluded.": {
    "cn": "不含所有装备、魔饰及其他加成。",
    "jp": "すべての装備、チャーム、その他のボーナスは含みません。",
    "kr": "모든 장비·주문석 및 기타 보너스는 제외합니다."
  },
  "No exact normal-equipment data is available for this class.": {
    "cn": "该职业没有精确的常规装备数据。",
    "jp": "このクラスの正確な通常装備データはありません。",
    "kr": "해당 직업의 정확한 일반 장비 데이터가 없습니다."
  },
  "Include PvE growth term": {
    "cn": "包含PvE成长项",
    "jp": "PvE成長項を含める",
    "kr": "PvE 성장 항목 포함"
  },
  "PvE growth included": {
    "cn": "已包含PvE成长项",
    "jp": "PvE成長項を含む",
    "kr": "PvE 성장 포함"
  },
  "Exact config rows · growth ×{n}": {
    "cn": "配置表精确数值 · 成长 ×{n}",
    "jp": "設定テーブルの正確な値 · 成長 ×{n}",
    "kr": "정확한 설정 표 값 · 성장 ×{n}"
  },
  "No exact growth row is available for that level.": {
    "cn": "该等级没有精确的成长数据。",
    "jp": "このレベルの正確な成長データはありません。",
    "kr": "해당 레벨의 정확한 성장 데이터가 없습니다."
  },
  "No exact main-level growth row is available.": {
    "cn": "该主线等级没有精确的成长数据。",
    "jp": "このメインレベルの正確な成長データはありません。",
    "kr": "해당 메인 레벨의 정확한 성장 데이터가 없습니다."
  },
  "Main {main} + seasonal {season}": {
    "cn": "主线 {main} + 赛季 {season}",
    "jp": "メイン {main} ＋シーズン {season}",
    "kr": "메인 {main} + 시즌 {season}"
  },
  "Main {n}": {
    "cn": "主线 {n}",
    "jp": "メイン {n}",
    "kr": "메인 {n}"
  },
  "Battle rules": {
    "cn": "战斗规则",
    "jp": "バトルルール",
    "kr": "전투 규칙"
  },
  "Dream Realm conditions": {
    "cn": "梦境条件",
    "jp": "夢幻領域の条件",
    "kr": "꿈의 세계 조건"
  },
  "Captured runtime updates": {
    "cn": "已捕获的运行时更新",
    "jp": "取得済みの実行時更新",
    "kr": "캡처된 런타임 업데이트"
  },
  "How damage is calculated": {
    "cn": "伤害计算方式",
    "jp": "ダメージの計算方法",
    "kr": "피해 계산 방식"
  },
  "Skill / level": {
    "cn": "技能 / 等级",
    "jp": "スキル／レベル",
    "kr": "스킬 / 레벨"
  },
  "Parameter": {
    "cn": "参数",
    "jp": "パラメータ",
    "kr": "매개변수"
  },
  "Installed": {
    "cn": "已安装版本",
    "jp": "インストール済み",
    "kr": "설치된 값"
  },
  "Registered hook": {
    "cn": "已注册钩子",
    "jp": "登録済みフック",
    "kr": "등록된 훅"
  },
  "Installed config": {
    "cn": "已安装配置",
    "jp": "インストール済み設定",
    "kr": "설치된 설정"
  },
  "Damage dealt": {
    "cn": "造成伤害",
    "jp": "与ダメージ",
    "kr": "가하는 피해"
  },
  "Damage taken": {
    "cn": "受到伤害",
    "jp": "被ダメージ",
    "kr": "받는 피해"
  },
  "Difficulty": {
    "cn": "难度",
    "jp": "難易度",
    "kr": "난이도"
  },
  "captured update available": {
    "cn": "有已捕获的更新",
    "jp": "取得済みの更新あり",
    "kr": "캡처된 업데이트 있음"
  },
  "These changes were captured from registered update hooks; final in-battle skill values were not captured.": {
    "cn": "这些变更来自已注册的更新钩子；尚未捕获战斗中最终实例化的技能数值。",
    "jp": "登録済みの更新フックから取得した変更です。戦闘中の最終スキル値は未取得です。",
    "kr": "등록된 업데이트 훅에서 캡처한 변경입니다. 전투 중 최종 스킬 값은 캡처되지 않았습니다."
  },
  "Installed description · captured parameter changes are listed under Battle rules": {
    "cn": "已安装版本的描述 · 已捕获的参数变更列在战斗规则中",
    "jp": "インストール済みの説明 · 取得したパラメータ変更はバトルルールに記載",
    "kr": "설치된 버전의 설명 · 캡처된 매개변수 변경은 전투 규칙에 표시"
  },
  "{skill} · Lv. 1 damage coefficient {before} → {after}": {
    "cn": "{skill} · 1级伤害系数 {before} → {after}",
    "jp": "{skill} · Lv.1 ダメージ係数 {before} → {after}",
    "kr": "{skill} · Lv.1 피해 계수 {before} → {after}"
  }
});
  Object.assign(messages, {
  "Choose Merlin’s appearance": {
    "cn": "选择梅林的外观",
    "jp": "マーリンの見た目を選ぶ",
    "kr": "멀린의 외형 선택"
  },
  "Optional — you can change this anytime in Settings.": {
    "cn": "可选，可随时在设置中更改。",
    "jp": "任意です。設定からいつでも変更できます。",
    "kr": "선택 사항입니다. 설정에서 언제든 변경할 수 있습니다."
  },
  "Merlin appearance": {
    "cn": "梅林外观",
    "jp": "マーリンの外見",
    "kr": "멀린 외형"
  },
  "Close": {
    "cn": "关闭",
    "jp": "閉じる",
    "kr": "닫기"
  },
  "Loading…": {
    "cn": "加载中…",
    "jp": "読み込み中…",
    "kr": "불러오는 중…"
  },
  "Preview gender": {
    "cn": "预览性别",
    "jp": "プレビューの性別",
    "kr": "미리보기 성별"
  },
  "Outfit group": {
    "cn": "服装分组",
    "jp": "衣装グループ",
    "kr": "의상 그룹"
  },
  "Default": {
    "cn": "默认",
    "jp": "デフォルト",
    "kr": "기본"
  },
  "Season {n}": {
    "cn": "第{n}赛季",
    "jp": "シーズン{n}",
    "kr": "시즌 {n}"
  },
  "Available looks": {
    "cn": "可选外观",
    "jp": "選べる外見",
    "kr": "선택 가능한 외형"
  },
  "Apply appearance": {
    "cn": "应用外观",
    "jp": "外見を適用",
    "kr": "외형 적용"
  },
  "Cancel": {
    "cn": "取消",
    "jp": "キャンセル",
    "kr": "취소"
  },
  "Appearance is saved separately for each gender.": {
    "cn": "外观按性别分别保存。",
    "jp": "外見は性別ごとに保存されます。",
    "kr": "외형은 성별마다 따로 저장됩니다."
  },
  "Look {n}": {
    "cn": "外观{n}",
    "jp": "外見{n}",
    "kr": "외형 {n}"
  },
  "Dialogue preview": {
    "cn": "对话预览",
    "jp": "会話プレビュー",
    "kr": "대화 미리보기"
  },
  "Could not load appearance. Try again.": {
    "cn": "无法加载外观，请重试。",
    "jp": "外見を読み込めませんでした。もう一度お試しください。",
    "kr": "외형을 불러오지 못했습니다. 다시 시도해 주세요."
  },
  "Viewpoint: {name}": {
    "cn": "当前视角：{name}",
    "jp": "視点：{name}",
    "kr": "현재 시점: {name}"
  }
});
  const languages = {cn: "zh-Hans", en: "en", jp: "ja", kr: "ko"};
  function language(value) { return Object.hasOwn(languages, value) ? value : "en"; }
  function text(key, locale = "en", values = {}) {
    const template = messages[key]?.[language(locale)] || String(key || "");
    return template.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(values, name) ? String(values[name]) : match);
  }
  function apply(document, locale) {
    document.documentElement.lang = languages[language(locale)];
    for (const node of document.querySelectorAll("[data-i18n]")) node.textContent = text(node.dataset.i18n, locale);
    for (const attribute of ["placeholder", "aria-label", "title"]) {
      for (const node of document.querySelectorAll(`[data-i18n-${attribute}]`)) {
        node.setAttribute(attribute, text(node.getAttribute(`data-i18n-${attribute}`), locale));
      }
    }
  }
  // Tab navigation restores a location but always carries the current reader preferences.
  function sectionHash(hash, preferences) {
    const [path, query = ""] = String(hash).replace(/^#/, "").split("?");
    const params = new URLSearchParams(query);
    for (const [key, value] of Object.entries(preferences)) params.set(key, value);
    return path + "?" + params.toString();
  }
  return {text, apply, language, sectionHash, messages};
});
