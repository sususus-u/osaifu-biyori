"use client";

// 口座登録・編集フォーム。
// accountId が渡されると編集モードになり、既存データを読み込んで更新・削除ができる。
// 種類を選ぶと、CATEGORY_DEFAULTS から円建てフラグ・タイプ・通知タイミングの
// 初期値が自動で入る。ポイント・その他は円建て/非円建てをユーザーが選び直せる。

import ConfirmSheet from "@/components/ConfirmSheet";
import { useState, useEffect, useRef, type FormEvent, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Camera } from "lucide-react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { guessServiceInfo } from "@/lib/knownServices";
import { getYenValue } from "@/lib/accountUtils";
import BusyIndicator from "@/components/BusyIndicator";
import { busyPreparing, waitForPaint } from "@/lib/busyView";
import { stashStampSavedMessage } from "@/lib/stampToast";
import { canonicalStampName, isStampGroupEntry, manualAddNotice, parseStampFace, stampFaceFromName, stampNameFromFace, normalizeName, pickAddTarget, toExistingItem, type ExistingItem } from "@/lib/stampMerge";
import { useAuth } from "@/contexts/AuthProvider";
import { prepareScanImage } from "@/lib/scanImage";
import {
  CATEGORY_DEFAULTS,
  type AccountCategory,
  type AccountType,
  type AccountDoc,
  type OutcomeEventType,
} from "@/types/firestore";

const CATEGORY_OPTIONS: { value: AccountCategory; label: string }[] = [
  { value: "electronic_money", label: "電子マネー" },
  { value: "points", label: "ポイント(pt)" },
  { value: "gift_certificate", label: "商品券・切手" },
  { value: "miles", label: "マイル" },
  { value: "coupon", label: "クーポン" },
  { value: "stamp_card", label: "スタンプカード" },
  { value: "other", label: "その他" },
];

// 手入力時、グループ名の候補として出す主要サービス名(大手のみ・随時追加可)
// Pay系は残高・ポイントの両方が候補に出るよう、口座名の候補は別途分けて用意
const KNOWN_SERVICE_NAMES = [
  "PayPay",
  "d(ドコモ)",
  "au PAY｜Ponta",
  "楽天",
  "WAON",
  "nanaco",
  "Suica",
  "PASMO",
  "Vポイント",
  "ANAマイレージクラブ",
  "JALマイレージバンク",
  "商品券・ギフトカード",
  "切手",
];

// グループ名(サービス名)ごとの、口座名(名前欄)の候補バリエーション。
// Pay系は「残高」「ポイント」の2種類が並存するため候補を複数用意し、それ以外は1種類のみ
const SERVICE_ACCOUNT_NAME_VARIANTS: Record<string, string[]> = {
  "PayPay": ["PayPay残高", "PayPayポイント", "PayPayポイント(期間限定)"],
  "d(ドコモ)": ["d払い残高", "dポイント", "dポイント(期間限定)"],
  "au PAY｜Ponta": ["au PAY残高", "Pontaポイント", "Pontaポイント(期間・利用先限定)", "au PAYポイント運用"],
  "楽天": ["楽天ペイ残高", "楽天ポイント", "楽天ポイント(期間限定)"],
  "WAON": ["WAON残高", "WAON POINT"],
  "nanaco": ["nanaco残高", "nanacoポイント"],
  "Suica": ["Suica残高"],
  "PASMO": ["PASMO残高"],
  "商品券・ギフトカード": ["アマゾンギフト券", "図書カード"],
  "切手": ["切手"],
  "ANAマイレージクラブ": ["ANAマイル", "ANA Pay残高"],
  "JALマイレージバンク": ["JALマイル", "JAL Pay残高"],
  "Vポイント": ["Vポイント", "Vポイント(期間・利用先限定)", "VポイントPay残高"],
};

// グループ名が候補にない場合、名前欄の候補として出す全サービスの口座名一覧
const KNOWN_ACCOUNT_NAMES = Object.values(SERVICE_ACCOUNT_NAME_VARIANTS).flat();

// 単位(balanceUnit)のプリセット選択肢。ここにない値は「その他」扱いで自由入力欄に入る
const KNOWN_BALANCE_UNITS = ["円", "pt", "マイル", "枚"];

// 種類(category)を選んだ際に単位へ自動セットするデフォルト値。
// stamp_card(単位の概念なし)とother(都度選択)は含めず、既存の選択をそのまま残す
const CATEGORY_UNIT_DEFAULTS: Partial<Record<AccountCategory, string>> = {
  electronic_money: "円",
  points: "pt",
  gift_certificate: "円",
  miles: "マイル",
  coupon: "枚",
};

export default function AccountForm({ accountId }: { accountId?: string }) {
  const router = useRouter();
  const { uid, isLoading } = useAuth();
  const isEditMode = Boolean(accountId);
  const physicalFileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [groupName, setGroupName] = useState("");
  const [category, setCategory] = useState<AccountCategory>("electronic_money");
  const [customCategoryLabel, setCustomCategoryLabel] = useState("");
  const [isYenBased, setIsYenBased] = useState(CATEGORY_DEFAULTS.electronic_money.isYenBased);
  const [accountType, setAccountType] = useState<AccountType>(CATEGORY_DEFAULTS.electronic_money.type);
  const [balance, setBalance] = useState("");
  const [balanceUnitOption, setBalanceUnitOption] = useState("円");
  const [customBalanceUnit, setCustomBalanceUnit] = useState("");
  const balanceUnit = balanceUnitOption === "その他" ? customBalanceUnit : balanceUnitOption;
  const [yenExchangeRate, setYenExchangeRate] = useState("");
  const [exchangeUnitCount, setExchangeUnitCount] = useState("");
  const [exchangeUnitYen, setExchangeUnitYen] = useState("");
  // 編集モードで読み込んだ既存のyenExchangeRateを、ユーザーがこの2欄を触るまで上書きしないためのフラグ
  const [exchangeRateTouched, setExchangeRateTouched] = useState(false);
  const [faceValue, setFaceValue] = useState("");
  // グループ名が「切手」のときの名前の入力(額面の数字)。stampManual は「名称を自分で付ける」。
  // savedManualName は、数字入力へ戻すとき、手で打った名前を失わないための控え
  const [stampFaceInput, setStampFaceInput] = useState("");
  const [stampManual, setStampManual] = useState(false);
  const [savedManualName, setSavedManualName] = useState("");
  const [itemQuantity, setItemQuantity] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  // 有効期限を「期間限定」「期限なし」のどちらにするか。null は未選択(新規登録時は選択必須)
  const [hasExpiry, setHasExpiry] = useState<boolean | null>(null);
  const [storageLocationMemo, setStorageLocationMemo] = useState("");
  const [firstStageDays, setFirstStageDays] = useState(
    CATEGORY_DEFAULTS.electronic_money.notificationDaysBefore[0]
  );
  const [secondStageDays, setSecondStageDays] = useState(
    CATEGORY_DEFAULTS.electronic_money.notificationDaysBefore[1]
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  // 現物の写真を縮めている間(縮小が終わるまで画面が変わらないため、待たされていることを伝える)
  const [isPreparingPhoto, setIsPreparingPhoto] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFetchingExisting, setIsFetchingExisting] = useState(isEditMode);
  const [errorMessage, setErrorMessage] = useState("");
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number } | null>(
    null
  );
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [pendingOutcome, setPendingOutcome] = useState<OutcomeEventType | null>(null);
  const [isRecordingOutcome, setIsRecordingOutcome] = useState(false);
  // スクショ読み取りの確信度が低かった項目(true の場合、枠色と注意文で強調する)
  const [balanceLowConfidence, setBalanceLowConfidence] = useState(false);
  const [expiryLowConfidence, setExpiryLowConfidence] = useState(false);
  // 新規登録時、名前欄からフォーカスが外れた際に同名の既存サービスが見つかった場合の情報
  // 同じ名前(空白・全角数字のゆれを除く)の既存の項目。足し先は、種類・額面を見て、下の pickAddTarget で選ぶ
  const [sameNameItems, setSameNameItems] = useState<(ExistingItem & { type: AccountType })[]>([]);
  const pickedDuplicate = pickAddTarget(sameNameItems, { name, category });
  const duplicateCount = pickedDuplicate.count;
  const duplicateAccount = pickedDuplicate.target
    ? {
        id: pickedDuplicate.target.id,
        name: pickedDuplicate.target.name,
        currentBalance: pickedDuplicate.target.currentBalance,
        type: pickedDuplicate.target.type,
        faceValue: pickedDuplicate.target.faceValue,
        itemQuantity: pickedDuplicate.target.itemQuantity,
      }
    : null;

  const isStampCard = category === "stamp_card";
  const isOther = category === "other";
  const isGiftCertificate = category === "gift_certificate";
  const isPoints = category === "points";

  // グループ名が「切手」の新規登録では、名前を額面の数字入力にする(編集モードでは出さず、今の名前のまま)。
  // 名前がすでに別の名称(読み取りの引き継ぎなど)なら、自動では数字入力にしない
  const stampGroup = isStampGroupEntry(isEditMode, groupName);
  const showStampNumeric =
    stampGroup && !stampManual && (name === "" || stampFaceInput !== "" || stampFaceFromName(name) !== null);
  const stampFaceShown =
    stampFaceInput !== "" ? stampFaceInput : stampFaceFromName(name) !== null ? String(stampFaceFromName(name)) : "";

  // グループ名に応じた名前欄の候補(該当サービスがなければ全サービスの一覧にフォールバック)
  const nameCandidates = SERVICE_ACCOUNT_NAME_VARIANTS[groupName.trim()] ?? KNOWN_ACCOUNT_NAMES;

  // KNOWN_BALANCE_UNITS にある値ならそのまま選択、なければ「その他」+自由入力欄にセットする
  function setBalanceUnitFromValue(unit: string) {
    if (KNOWN_BALANCE_UNITS.includes(unit)) {
      setBalanceUnitOption(unit);
      setCustomBalanceUnit("");
    } else {
      setBalanceUnitOption("その他");
      setCustomBalanceUnit(unit);
    }
  }

  // グループ名の候補が1つだけに定まる場合、名前が未入力なら自動でセットする
  useEffect(() => {
    const variants = SERVICE_ACCOUNT_NAME_VARIANTS[groupName.trim()];
    if (variants && variants.length === 1 && name === "") {
      setName(variants[0]);
    }
    // name は groupName の変更時だけ読み、その時点の値は最新。依存に name を足すと、
    // 名前を手で消したとき、自動入力が再発火して消せなくなるため、依存に含めない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupName]);

  // 商品券・ギフトカードの場合、残高は額面×枚数から自動計算する(手入力させない)
  useEffect(() => {
    if (category !== "gift_certificate") return;
    if (faceValue === "" || itemQuantity === "") return;
    const fv = Number(faceValue);
    const qty = Number(itemQuantity);
    if (Number.isNaN(fv) || Number.isNaN(qty)) return;
    setBalance(String(fv * qty));
  }, [faceValue, itemQuantity, category]);

  // 換算元(exchangeUnitCount)・換算先(exchangeUnitYen)の両方が入力されていればレートを自動計算する。
  // 編集モードで読み込んだ既存レートを、ユーザーがこの2欄を触るまで上書きしないよう exchangeRateTouched で制御する
  useEffect(() => {
    if (!exchangeRateTouched) return;
    if (exchangeUnitCount === "" || exchangeUnitYen === "") {
      setYenExchangeRate("");
      return;
    }
    const count = Number(exchangeUnitCount);
    const yen = Number(exchangeUnitYen);
    if (Number.isNaN(count) || Number.isNaN(yen) || count <= 0) return;
    setYenExchangeRate(String(yen / count));
  }, [exchangeUnitCount, exchangeUnitYen, exchangeRateTouched]);

  // 名前欄が既知の口座名候補と完全一致した場合(候補から選んだ・自動入力された場合)、
  // その名前から種類・円建てフラグを推測して連動させる
  useEffect(() => {
    if (!KNOWN_ACCOUNT_NAMES.includes(name)) return;
    const info = guessServiceInfo(name, null);
    setCategory(info.category);
    const defaults = CATEGORY_DEFAULTS[info.category];
    setIsYenBased(info.isYenBased);
    setAccountType(defaults.type);
    setFirstStageDays(defaults.notificationDaysBefore[0]);
    setSecondStageDays(defaults.notificationDaysBefore[1]);
    const unitDefault = CATEGORY_UNIT_DEFAULTS[info.category];
    if (unitDefault) {
      setBalanceUnitFromValue(unitDefault);
    }
  }, [name]);

  // 編集モードの場合、既存データを読み込んでフォームに反映する
  useEffect(() => {
    if (!accountId) return;
    let isCancelled = false;

    async function fetchExisting() {
      try {
        const snap = await getDoc(doc(db, "accounts", accountId!));
        if (isCancelled || !snap.exists()) return;
        const data = snap.data() as AccountDoc;

        setName(data.name ?? "");
        setGroupName(data.groupName ?? "");
        setCategory(data.category);
        setCustomCategoryLabel(data.customCategoryLabel ?? "");
        setIsYenBased(data.isYenBased);
        setAccountType(data.type);
        setBalance(
          data.currentBalance === undefined || data.currentBalance === null
            ? ""
            : String(data.currentBalance)
        );
        setBalanceUnitFromValue(data.balanceUnit ?? "円");
        if (data.yenExchangeRate !== undefined && data.yenExchangeRate !== null) {
          setYenExchangeRate(String(data.yenExchangeRate));
        }
        if (data.exchangeUnitCount !== undefined && data.exchangeUnitCount !== null) {
          setExchangeUnitCount(String(data.exchangeUnitCount));
        }
        if (data.exchangeUnitYen !== undefined && data.exchangeUnitYen !== null) {
          setExchangeUnitYen(String(data.exchangeUnitYen));
        }
        if (data.faceValue !== undefined && data.faceValue !== null) {
          setFaceValue(String(data.faceValue));
        }
        if (data.itemQuantity !== undefined && data.itemQuantity !== null) {
          setItemQuantity(String(data.itemQuantity));
        }
        if (data.expiryDate) {
          const d = (data.expiryDate as Timestamp).toDate();
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const dd = String(d.getDate()).padStart(2, "0");
          setExpiryDate(`${yyyy}-${mm}-${dd}`);
          setHasExpiry(true);
        } else {
          // 期限日は未入力でも、名前に「期間」を含む場合は「期限ありだが未入力」の状態として復元する
          setHasExpiry((data.name ?? "").includes("期間"));
        }
        setStorageLocationMemo(data.storageLocationMemo ?? "");
        setFirstStageDays(data.notificationTiming?.firstStageDays ?? 90);
        setSecondStageDays(data.notificationTiming?.secondStageDays ?? 21);
      } catch (error) {
        console.error(error);
        setErrorMessage("データの読み込みに失敗しました。");
      } finally {
        if (!isCancelled) setIsFetchingExisting(false);
      }
    }

    fetchExisting();
    return () => {
      isCancelled = true;
    };
  }, [accountId]);

  // 新規登録時のみ、スクショ読み取り結果(sessionStorageのキュー)があれば事前入力する。
  // 内訳分割(通常/期間限定など)で複数口座がある場合、1件登録するたびに次の項目へ進む。
  useEffect(() => {
    if (accountId) return;
    const raw = sessionStorage.getItem("scan-prefill-queue");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as {
        total: number;
        items: Array<{
          name?: string;
          groupName?: string;
          category?: AccountCategory;
          isYenBased?: boolean;
          balance?: string | number;
          balanceUnit?: string;
          expiryDate?: string;
          balanceLowConfidence?: boolean;
          expiryLowConfidence?: boolean;
        }>;
      };
      const data = parsed.items[0];
      if (!data) return;

      setScanProgress({ current: parsed.total - parsed.items.length + 1, total: parsed.total });

      if (data.name) setName(data.name);
      if (data.groupName) setGroupName(data.groupName);
      if (data.category) {
        setCategory(data.category);
        const defaults = CATEGORY_DEFAULTS[data.category];
        setAccountType(defaults.type);
        setFirstStageDays(defaults.notificationDaysBefore[0]);
        setSecondStageDays(defaults.notificationDaysBefore[1]);
      }
      if (typeof data.isYenBased === "boolean") setIsYenBased(data.isYenBased);
      if (data.balance !== undefined && data.balance !== "") setBalance(String(data.balance));
      if (data.balanceUnit) setBalanceUnitFromValue(data.balanceUnit);
      if (data.expiryDate) setExpiryDate(data.expiryDate);
      // AIの読み取り結果(expiryDateの有無)に応じて自動選択する。後から手動での変更は可能
      setHasExpiry(Boolean(data.expiryDate));
      setBalanceLowConfidence(Boolean(data.balanceLowConfidence));
      setExpiryLowConfidence(Boolean(data.expiryLowConfidence));
    } catch (error) {
      console.error(error);
    }
  }, [accountId]);

  async function handlePhysicalCapture(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setErrorMessage("");
    setIsPreparingPhoto(true);
    await waitForPaint(); // 表示を先に描画してから、重い縮小を始める
    try {
      const { base64, mediaType } = await prepareScanImage(file);
      sessionStorage.setItem(
        "physical-scan-pending-image",
        JSON.stringify({ base64, mediaType })
      );
      router.push("/accounts/scan-physical");
    } catch (error) {
      console.error(error);
      setErrorMessage("画像を読み込めませんでした。もう一度、撮り直してください");
    } finally {
      setIsPreparingPhoto(false);
    }
  }

  // 新規登録時のみ、名前欄からフォーカスが外れたタイミングで同名の既存サービスを検索する
  async function handleNameBlur() {
    if (isEditMode || !uid || !name.trim()) return;
    try {
      // 名前の空白と全角数字のゆれは同じとみなす(「切手1円」と「切手 1円」)ので、ownerId だけで取得して絞る
      const q = query(collection(db, "accounts"), where("ownerId", "==", uid));
      const snap = await getDocs(q);
      const found = snap.docs.flatMap((d) => {
        const item = toExistingItem(d.id, d.data());
        return item && normalizeName(item.name) === normalizeName(name)
          ? [{ ...item, type: (d.data() as AccountDoc).type }]
          : [];
      });
      setSameNameItems(found);
    } catch (error) {
      console.error(error);
    }
  }

  // 額面の数字入力。名前を「切手 N円」にし、額面の欄にも同じ値を入れる。種類は商品券・切手にそろえる(名前が決まる入力のとき)
  function applyStampFace(raw: string) {
    setStampFaceInput(raw);
    setSameNameItems([]);
    const r = parseStampFace(raw);
    if (r.kind === "ok") {
      setName(stampNameFromFace(r.value));
      setFaceValue(String(r.value));
      if (category !== "gift_certificate") handleCategoryChange("gift_certificate");
    } else {
      setName("");
    }
  }

  // 「名称を自分で付ける」/「額面の数字で入力する」の切り替え。手で打った名前は控えて、戻しても失わない
  function toggleStampManual() {
    setSameNameItems([]);
    if (showStampNumeric) {
      setStampManual(true);
      if (savedManualName) setName(savedManualName);
    } else {
      setSavedManualName(name);
      setStampManual(false);
      const r = parseStampFace(stampFaceShown);
      setName(r.kind === "ok" ? stampNameFromFace(r.value) : "");
    }
  }

  function handleCategoryChange(newCategory: AccountCategory) {
    setCategory(newCategory);
    const defaults = CATEGORY_DEFAULTS[newCategory];
    setIsYenBased(defaults.isYenBased);
    setAccountType(defaults.type);
    setFirstStageDays(defaults.notificationDaysBefore[0]);
    setSecondStageDays(defaults.notificationDaysBefore[1]);
    const unitDefault = CATEGORY_UNIT_DEFAULTS[newCategory];
    if (unitDefault) {
      setBalanceUnitFromValue(unitDefault);
    }
  }

  // 登録・置き換え・追加のいずれでも使う入力チェック。エラーがあれば errorMessage をセットして false を返す
  function validateForm(): boolean {
    if (!uid) {
      setErrorMessage("ログイン処理が完了していません。少し待ってからもう一度お試しください。");
      return false;
    }
    if (showStampNumeric) {
      const r = parseStampFace(stampFaceShown);
      if (r.kind === "invalid") {
        setErrorMessage(r.message);
        return false;
      }
      if (r.kind === "empty") {
        setErrorMessage("額面(円)を数字で入力してください。名称を自分で付けるときは、下のボタンで切り替えます。");
        return false;
      }
    }
    if (!name.trim()) {
      setErrorMessage("名前を入力してください。");
      return false;
    }
    if (isOther && !customCategoryLabel.trim()) {
      setErrorMessage("「その他」を選んだ場合は、種類の名前を入力してください。");
      return false;
    }
    if (isGiftCertificate && (faceValue === "" || itemQuantity === "")) {
      setErrorMessage("額面と枚数を入力してください。");
      return false;
    }
    if (!isEditMode && hasExpiry === null) {
      setErrorMessage("有効期限/期限なしを選択してください。");
      return false;
    }
    return true;
  }

  // 今のフォーム入力から、accounts ドキュメントのペイロードと updates サブコレクション用レコードを組み立てる
  function buildPayloadAndUpdateRecord() {
    const now = serverTimestamp();
    const payload = {
      ownerId: uid,
      name: canonicalStampName(name.trim()),
      groupName: groupName.trim() || null,
      category,
      ...(isOther ? { customCategoryLabel: customCategoryLabel.trim() } : {}),
      isYenBased,
      type: accountType,
      ...(isStampCard
        ? {}
        : {
            currentBalance: balance === "" ? null : Number(balance),
            balanceUnit,
            yenExchangeRate: yenExchangeRate === "" ? null : Number(yenExchangeRate),
            exchangeUnitCount: exchangeUnitCount === "" ? null : Number(exchangeUnitCount),
            exchangeUnitYen: exchangeUnitYen === "" ? null : Number(exchangeUnitYen),
            faceValue: faceValue === "" ? null : Number(faceValue),
            itemQuantity: itemQuantity === "" ? null : Number(itemQuantity),
          }),
      expiryDate: expiryDate ? Timestamp.fromDate(new Date(expiryDate)) : null,
      storageLocationMemo: storageLocationMemo.trim() || null,
      notificationTiming: {
        firstStageDays: Number(firstStageDays),
        secondStageDays: Number(secondStageDays),
      },
      lastUpdatedAt: now,
      updatedAt: now,
    };

    const updateRecord = {
      recordedAt: now,
      balance: balance === "" ? null : Number(balance),
      expiryDate: expiryDate ? Timestamp.fromDate(new Date(expiryDate)) : null,
      source: "manual" as const,
      confirmedByUser: true,
    };

    return { now, payload, updateRecord };
  }

  // 重複が見つからなかった場合、および「新たに登録する」を選んだ場合の処理
  // スクショ由来のキューに次の項目が残っていれば、続けてそちらを登録する。
  // 残っていなければホームへ遷移する。
  // 「置き換える」「今回の分を追加する」経由でもキューを引き継がないと、
  // 残りの項目がsessionStorageに取り残されたまま次のスキャンで上書きされ、
  // ユーザーには「保存されなかった」ように見えてしまう。
  function goToNextQueueItemOrHome() {
    const raw = sessionStorage.getItem("scan-prefill-queue");
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { total: number; items: unknown[] };
        // 「前の項目に戻る」で辿れるよう、今回保存した入力内容を履歴に積んでおく
        const historyRaw = sessionStorage.getItem("scan-prefill-history");
        const history = historyRaw ? (JSON.parse(historyRaw) as unknown[]) : [];
        history.push({
          name,
          groupName,
          category,
          isYenBased,
          balance,
          balanceUnit,
          expiryDate,
          balanceLowConfidence,
          expiryLowConfidence,
        });
        sessionStorage.setItem("scan-prefill-history", JSON.stringify(history));

        const restItems = parsed.items.slice(1);
        if (restItems.length > 0) {
          sessionStorage.setItem(
            "scan-prefill-queue",
            JSON.stringify({ total: parsed.total, items: restItems })
          );
          // 既に /accounts/new にいる場合、router.push だけでは再読み込みされないため
          // 画面を確実に作り直すよう window.location で遷移する
          // 全画面で作り直すための遷移。router.push だと再読み込みされず動作が変わるため除外する
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.href = "/accounts/new";
          return;
        }
        sessionStorage.removeItem("scan-prefill-queue");
      } catch {
        sessionStorage.removeItem("scan-prefill-queue");
      }
    }
    router.push("/");
  }

  // 「前の項目に戻る」: 履歴から直前の項目を取り出し、キューの先頭に戻して再読み込みする
  function handleGoToPreviousItem() {
    const historyRaw = sessionStorage.getItem("scan-prefill-history");
    const queueRaw = sessionStorage.getItem("scan-prefill-queue");
    if (!historyRaw || !queueRaw) return;
    try {
      const history = JSON.parse(historyRaw) as unknown[];
      const previousItem = history.pop();
      if (!previousItem) return;
      const parsed = JSON.parse(queueRaw) as { total: number; items: unknown[] };
      sessionStorage.setItem("scan-prefill-history", JSON.stringify(history));
      sessionStorage.setItem(
        "scan-prefill-queue",
        JSON.stringify({ total: parsed.total, items: [previousItem, ...parsed.items] })
      );
      // 全画面で作り直すための遷移。router.push だと再読み込みされず動作が変わるため除外する
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/accounts/new";
    } catch (error) {
      console.error(error);
    }
  }

  // 「この項目は登録しない」: 保存せずにキューから現在の項目だけを取り除き、次があれば進み、無ければ一覧へ戻る
  function handleSkipItem() {
    const raw = sessionStorage.getItem("scan-prefill-queue");
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { total: number; items: unknown[] };
        const restItems = parsed.items.slice(1);
        if (restItems.length > 0) {
          sessionStorage.setItem(
            "scan-prefill-queue",
            JSON.stringify({ total: parsed.total, items: restItems })
          );
          // 全画面で作り直すための遷移。router.push だと再読み込みされず動作が変わるため除外する
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.href = "/accounts/new";
          return;
        }
        sessionStorage.removeItem("scan-prefill-queue");
      } catch {
        sessionStorage.removeItem("scan-prefill-queue");
      }
    }
    router.push("/");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMessage("");
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const { now, payload, updateRecord } = buildPayloadAndUpdateRecord();

      if (isEditMode && accountId) {
        await updateDoc(doc(db, "accounts", accountId), payload);
        await addDoc(collection(db, "accounts", accountId, "updates"), updateRecord);
        router.push("/");
      } else {
        const docRef = await addDoc(collection(db, "accounts"), { ...payload, createdAt: now });
        await addDoc(collection(db, "accounts", docRef.id, "updates"), updateRecord);
        goToNextQueueItemOrHome();
      }
    } catch (error) {
      console.error(error);
      setErrorMessage("保存に失敗しました。もう一度お試しください。");
    } finally {
      setIsSubmitting(false);
    }
  }

  // 「置き換える」: 見つかった既存口座を、今のフォーム入力で上書きする
  async function handleReplaceExisting() {
    setErrorMessage("");
    if (!validateForm()) return;
    if (!duplicateAccount) return;

    setIsSubmitting(true);
    try {
      const { payload, updateRecord } = buildPayloadAndUpdateRecord();
      await updateDoc(doc(db, "accounts", duplicateAccount.id), payload);
      await addDoc(collection(db, "accounts", duplicateAccount.id, "updates"), updateRecord);
      goToNextQueueItemOrHome();
    } catch (error) {
      console.error(error);
      setErrorMessage("保存に失敗しました。もう一度お試しください。");
    } finally {
      setIsSubmitting(false);
    }
  }

  // 「今回の分を追加する」: 見つかった既存口座の残高・額面・枚数に、今回の入力値を加算する
  async function handleAddToExisting() {
    setErrorMessage("");
    if (!validateForm()) return;
    if (!duplicateAccount) return;

    setIsSubmitting(true);
    try {
      const now = serverTimestamp();
      const newBalance = (duplicateAccount.currentBalance ?? 0) + (balance === "" ? 0 : Number(balance));
      // 額面は1枚あたりの単価なので加算せず、今回入力した値で上書きする
      const newFaceValue = faceValue === "" ? duplicateAccount.faceValue ?? 0 : Number(faceValue);
      const newItemQuantity =
        (duplicateAccount.itemQuantity ?? 0) + (itemQuantity === "" ? 0 : Number(itemQuantity));

      await updateDoc(doc(db, "accounts", duplicateAccount.id), {
        currentBalance: newBalance,
        yenExchangeRate: yenExchangeRate === "" ? null : Number(yenExchangeRate),
        exchangeUnitCount: exchangeUnitCount === "" ? null : Number(exchangeUnitCount),
        exchangeUnitYen: exchangeUnitYen === "" ? null : Number(exchangeUnitYen),
        faceValue: newFaceValue,
        itemQuantity: newItemQuantity,
        lastUpdatedAt: now,
        updatedAt: now,
      });
      await addDoc(collection(db, "accounts", duplicateAccount.id, "updates"), {
        recordedAt: now,
        balance: newBalance,
        expiryDate: expiryDate ? Timestamp.fromDate(new Date(expiryDate)) : null,
        source: "manual" as const,
        confirmedByUser: true,
      });
      // 足した行の下に案内を出す(読み取りの保存と同じ仕組み)。合計は、上で保存した値から作る
      const addQuantity = itemQuantity === "" ? 0 : Number(itemQuantity);
      const addBalance = balance === "" ? 0 : Number(balance);
      const text = manualAddNotice({
        name: duplicateAccount.name,
        addQuantity,
        newQuantity: newItemQuantity,
        addBalance,
        newBalance,
        unit: balanceUnit || "円",
        multiple: duplicateCount > 1,
      });
      stashStampSavedMessage(window.sessionStorage, {
        message: text,
        items: [{ id: duplicateAccount.id, kind: "add", text }],
      });
      goToNextQueueItemOrHome();
    } catch (error) {
      console.error(error);
      setErrorMessage("保存に失敗しました。もう一度お試しください。");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!accountId) return;

    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, "accounts", accountId));
      router.push("/");
    } catch (error) {
      console.error(error);
      setErrorMessage("削除に失敗しました。もう一度お試しください。");
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  }

  async function handleOutcome(eventType: OutcomeEventType) {
    if (!accountId || !uid) return;

    setIsRecordingOutcome(true);
    try {
      const yenValue = getYenValue({
        isYenBased,
        currentBalance: balance === "" ? undefined : Number(balance),
        yenExchangeRate: yenExchangeRate === "" ? null : Number(yenExchangeRate),
      });

      await addDoc(collection(db, "outcome_events"), {
        ownerId: uid,
        accountId,
        accountName: name,
        category,
        eventType,
        eventDate: serverTimestamp(),
        ...(yenValue !== null ? { amount: yenValue } : {}),
        isYenBased,
        createdAt: serverTimestamp(),
      });

      if (accountType === "finite") {
        await deleteDoc(doc(db, "accounts", accountId));
      } else {
        await updateDoc(doc(db, "accounts", accountId), {
          currentBalance: 0,
          expiryDate: null,
          lastUpdatedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      router.push("/");
    } catch (error) {
      console.error(error);
      setErrorMessage("記録に失敗しました。もう一度お試しください。");
      setIsRecordingOutcome(false);
      setPendingOutcome(null);
    }
  }

  if (isLoading || isFetchingExisting) {
    return <p style={{ fontSize: 14, color: "#999" }}>読み込み中です...</p>;
  }

  return (
    <>
      <form onSubmit={handleSubmit}>
        {!isEditMode && (
          <>
            <Link href="/accounts/scan" className="btn-primary" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>
              画面のスクショで登録
            </Link>
            <button
              type="button"
              onClick={() => physicalFileInputRef.current?.click()}
              disabled={isPreparingPhoto}
              className="btn-primary"
              style={{ display: "block", width: "100%", textAlign: "center", marginTop: 12, background: "#8a5a62" }}
            >
              現物を撮影して登録
            </button>
            {isPreparingPhoto && <BusyIndicator title={busyPreparing().title} note={busyPreparing().note} />}
            <input
              ref={physicalFileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhysicalCapture}
              style={{ display: "none" }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
              <div style={{ flex: 1, height: 1, background: "#eee" }} />
              <span style={{ fontSize: 12, color: "#999" }}>または、直接入力する</span>
              <div style={{ flex: 1, height: 1, background: "#eee" }} />
            </div>
          </>
        )}

        {scanProgress && scanProgress.total > 1 && (
          <div
            className="card"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              padding: "14px 16px",
              marginBottom: 20,
              background: "var(--brand)",
              color: "#fff",
              border: "none",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 28,
                fontWeight: 700,
                textAlign: "center",
              }}
            >
              <Camera size={20} style={{ flexShrink: 0, color: "#fff" }} />
              <span>
                {scanProgress.current} / {scanProgress.total} 件目
              </span>
            </div>
            <span style={{ fontSize: 13, textAlign: "center" }}>
              内容を確認して登録してください。
            </span>
          </div>
        )}

        <div className="field">
          <label>グループ名(任意)</label>
          <div style={{ position: "relative" }}>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="例:PayPay"
              list="known-service-names"
              style={{ paddingRight: groupName ? 32 : undefined }}
            />
            {groupName && (
              <button
                type="button"
                onClick={() => setGroupName("")}
                aria-label="グループ名をクリア"
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  border: "none",
                  background: "none",
                  color: "#999",
                  fontSize: 16,
                  cursor: "pointer",
                  padding: 4,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            )}
          </div>
          <datalist id="known-service-names">
            {KNOWN_SERVICE_NAMES.map((serviceName) => (
              <option key={serviceName} value={serviceName} />
            ))}
          </datalist>
          <p style={{ fontSize: 13, color: "#999", marginTop: 6 }}>
            サービス名だけを入れてください(例:PayPay)。「残高」「ポイント」などの区別は、下の「名前」欄の方に入れます。同じグループ名を付けておくと、一覧の「サービス別」タブでまとめて表示されます
          </p>
        </div>

        <div className="field">
          <label>{showStampNumeric ? "額面(切手 ○円)" : "名前"}</label>
          {showStampNumeric && (
            <>
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={stampFaceShown}
                  onChange={(e) => applyStampFace(e.target.value)}
                  onBlur={handleNameBlur}
                  placeholder="例:84"
                  aria-label="額面(円)"
                  style={{ paddingRight: 32 }}
                />
                <span
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#999" }}
                >
                  円
                </span>
              </div>
              <p style={{ fontSize: 13, color: "#999", marginTop: 6 }}>
                名前: {name || "(額面を入れると「切手 ○円」になります)"}
              </p>
            </>
          )}
          {stampGroup && (
            <button
              type="button"
              onClick={toggleStampManual}
              style={{ border: "none", background: "none", color: "var(--brand)", fontSize: 13, padding: "4px 0", textDecoration: "underline" }}
            >
              {showStampNumeric ? "名称を自分で付ける(記念切手など)" : "額面の数字で入力する"}
            </button>
          )}
          {!showStampNumeric && (
          <>
          <div style={{ position: "relative" }}>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSameNameItems([]);
              }}
              onBlur={handleNameBlur}
              placeholder="例:PayPay残高"
              list="known-account-names"
              style={{ paddingRight: name ? 32 : undefined }}
            />
            {name && (
              <button
                type="button"
                onClick={() => {
                  setName("");
                  setSameNameItems([]);
                }}
                aria-label="名前をクリア"
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  border: "none",
                  background: "none",
                  color: "#999",
                  fontSize: 16,
                  cursor: "pointer",
                  padding: 4,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            )}
          </div>
          <datalist id="known-account-names">
            {nameCandidates.map((candidateName) => (
              <option key={candidateName} value={candidateName} />
            ))}
          </datalist>
          </>
          )}
        </div>

        <div className="field">
          <label>種類</label>
          <select value={category} onChange={(e) => handleCategoryChange(e.target.value as AccountCategory)}>
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {isOther && (
          <div className="field">
            <label>種類の名前(自由入力)</label>
            <input
              type="text"
              value={customCategoryLabel}
              onChange={(e) => setCustomCategoryLabel(e.target.value)}
              placeholder="例:友達との貸し借り"
            />
          </div>
        )}

        {isOther && (
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6, color: "#555" }}>
              表示単位
            </label>
            <div style={{ display: "flex", gap: 16, fontSize: 14 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input type="radio" checked={isYenBased} onChange={() => setIsYenBased(true)} />
                円
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input type="radio" checked={!isYenBased} onChange={() => setIsYenBased(false)} />
                ポイント・マイル等
              </label>
            </div>
          </div>
        )}

        {isOther && (
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6, color: "#555" }}>
              タイプ
            </label>
            <div style={{ display: "flex", gap: 16, fontSize: 14 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input
                  type="radio"
                  checked={accountType === "finite"}
                  onChange={() => setAccountType("finite")}
                />
                完結型(使いきる/失効する)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input
                  type="radio"
                  checked={accountType === "continuous"}
                  onChange={() => setAccountType("continuous")}
                />
                継続型(残高が増減し続ける)
              </label>
            </div>
          </div>
        )}

        {!isStampCard && !isGiftCertificate && (
          <div style={{ display: "flex", gap: 12 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>残高</label>
              <input
                type="number"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                style={balanceLowConfidence ? { borderColor: "#b56a1e", background: "#fdf3e7" } : undefined}
              />
              {balanceLowConfidence && (
                <p style={{ fontSize: 12, color: "#b56a1e", marginTop: 4 }}>
                  読み取りに自信が持てませんでした。画像と見比べて、残高を確認してください。
                </p>
              )}
            </div>
            <div className="field" style={{ width: 130 }}>
              <label>単位</label>
              <select
                value={isOther ? balanceUnitOption : CATEGORY_UNIT_DEFAULTS[category] ?? balanceUnitOption}
                onChange={(e) => setBalanceUnitOption(e.target.value)}
                disabled={!isOther}
              >
                <option value="円">円</option>
                <option value="pt">ポイント(pt)</option>
                <option value="マイル">マイル</option>
                <option value="枚">枚</option>
                <option value="その他">その他(自由入力)</option>
              </select>
              {isOther && balanceUnitOption === "その他" && (
                <input
                  type="text"
                  value={customBalanceUnit}
                  onChange={(e) => setCustomBalanceUnit(e.target.value)}
                  placeholder="単位を入力"
                  style={{ marginTop: 6 }}
                />
              )}
            </div>
          </div>
        )}

        {isPoints && (
          <div
            className="field"
            style={{ marginLeft: 16, paddingLeft: 12, borderLeft: "2px solid #eee" }}
          >
            <label>円換算レート(任意)</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
              <input
                type="number"
                min="0"
                value={exchangeUnitCount}
                onChange={(e) => {
                  setExchangeRateTouched(true);
                  setExchangeUnitCount(e.target.value);
                }}
                style={{ width: 88 }}
              />
              {balanceUnit || "ポイント"} =
              <input
                type="number"
                min="0"
                value={exchangeUnitYen}
                onChange={(e) => {
                  setExchangeRateTouched(true);
                  setExchangeUnitYen(e.target.value);
                }}
                style={{ width: 88 }}
              />
              円
            </div>
            <p style={{ fontSize: 13, color: "#999", marginTop: 6 }}>
              例:200ポイント=1000円の場合、200と1000を入力してください。設定すると、円換算した金額の目安が一覧に表示されます。未入力の場合は1pt=1円として表示されます
            </p>
          </div>
        )}

        {isGiftCertificate && (
          <div style={{ display: "flex", gap: 12 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>額面</label>
              <div style={{ position: "relative" }}>
                <input
                  type="number"
                  value={faceValue}
                  onChange={(e) => setFaceValue(e.target.value)}
                  placeholder="1枚あたり"
                  style={{ paddingRight: 32 }}
                />
                <span
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    fontSize: 13,
                    color: "#999",
                  }}
                >
                  円
                </span>
              </div>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>枚数</label>
              <div style={{ position: "relative" }}>
                <input
                  type="number"
                  value={itemQuantity}
                  onChange={(e) => setItemQuantity(e.target.value)}
                  placeholder="枚数"
                  style={{ paddingRight: 32 }}
                />
                <span
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    fontSize: 13,
                    color: "#999",
                  }}
                >
                  枚
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="field">
          <label>有効期限の設定</label>
          <div style={{ display: "flex", flexWrap: "nowrap", gap: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
              <input
                type="radio"
                checked={hasExpiry === true}
                onChange={() => setHasExpiry(true)}
                style={{ width: "auto", padding: 0 }}
              />
              期間限定
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
              <input
                type="radio"
                checked={hasExpiry === false}
                onChange={() => {
                  setHasExpiry(false);
                  setExpiryDate("");
                }}
                style={{ width: "auto", padding: 0 }}
              />
              期限なし
            </label>
          </div>
        </div>

        {hasExpiry !== false && (
          <div className="field">
            <label>有効期限(任意)</label>
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              style={expiryLowConfidence ? { borderColor: "#b56a1e", background: "#fdf3e7" } : undefined}
            />
            {expiryLowConfidence && (
              <p style={{ fontSize: 12, color: "#b56a1e", marginTop: 4 }}>
                読み取りに自信が持てませんでした。画像と見比べて、期限を確認してください。
              </p>
            )}
            <p style={{ fontSize: 13, color: "#999", marginTop: 6 }}>
              空欄の場合は「期限なし」タブに表示されます
            </p>
            <p style={{ fontSize: 13, color: "#999", marginTop: 6 }}>
              名前に「期間限定」が含まれる場合は、期限が分からなくても「期間限定」タブに表示されます。期限が分かり次第、入力してください。
            </p>
          </div>
        )}

        <div className="field">
          <label>保管場所メモ(任意)</label>
          <input
            type="text"
            value={storageLocationMemo}
            onChange={(e) => setStorageLocationMemo(e.target.value)}
            placeholder="例:財布/車/引き出し"
          />
        </div>

        <div className="field">
          <label>通知タイミング</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
            <input
              type="number"
              value={firstStageDays}
              onChange={(e) => setFirstStageDays(Number(e.target.value))}
              style={{ width: 72 }}
            />
            日前 /
            <input
              type="number"
              value={secondStageDays}
              onChange={(e) => setSecondStageDays(Number(e.target.value))}
              style={{ width: 72 }}
            />
            日前
          </div>
        </div>

        {errorMessage && <p style={{ fontSize: 13, color: "#b3261e", marginBottom: 20 }}>{errorMessage}</p>}

        {scanProgress && scanProgress.total > 1 && (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 16, marginBottom: 20 }}>
            {scanProgress.current >= 2 && (
              <button
                type="button"
                onClick={handleGoToPreviousItem}
                style={{
                  width: "100%",
                  padding: "10px",
                  fontSize: 13,
                  border: "1px solid #ddd",
                  borderRadius: "var(--radius-pill)",
                  background: "#fef8f5",
                  color: "#333",
                  marginTop: 8,
                }}
              >
                ◀ 前の項目に戻る
              </button>
            )}
            <button
              type="button"
              onClick={handleSkipItem}
              style={{
                width: "100%",
                padding: "10px",
                fontSize: 13,
                border: "1px solid #ddd",
                borderRadius: "var(--radius-pill)",
                background: "#fef8f5",
                color: "#333",
                marginTop: 8,
              }}
            >
              この項目は登録しない
            </button>
          </div>
        )}

        {!isEditMode && duplicateAccount ? (
          <>
            <p style={{ fontSize: 13, color: "#555", marginBottom: 12 }}>
              同じ名前のサービスが既にあります。現在の残高:¥{duplicateAccount.currentBalance ?? 0}
              {duplicateAccount.itemQuantity !== null && duplicateAccount.itemQuantity !== undefined && (
                <>(枚数:{duplicateAccount.itemQuantity}枚)</>
              )}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                type="button"
                onClick={handleReplaceExisting}
                disabled={isSubmitting || isDeleting}
                className="btn-primary"
              >
                {isSubmitting ? "保存中..." : "置き換える"}
              </button>
              {duplicateAccount.type === "finite" && (
                <button
                  type="button"
                  onClick={handleAddToExisting}
                  disabled={isSubmitting || isDeleting}
                  className="btn-primary"
                >
                  {isSubmitting ? "保存中..." : "今回の分を追加する"}
                </button>
              )}
              <button type="submit" disabled={isSubmitting || isDeleting} className="btn-primary">
                {isSubmitting ? "保存中..." : "新たに登録する"}
              </button>
            </div>
          </>
        ) : (
          <button type="submit" disabled={isSubmitting || isDeleting} className="btn-primary">
            {isSubmitting ? "保存中..." : isEditMode ? "更新する" : "登録する"}
          </button>
        )}

        {isEditMode && (
          <div className="action-row" style={{ marginTop: 12 }}>
            {accountType === "finite" && (
              <button
                type="button"
                onClick={() => setPendingOutcome("used_up")}
                disabled={isSubmitting || isDeleting}
                className="btn-outline"
              >
                使いきった
              </button>
            )}
            <button
              type="button"
              onClick={() => setPendingOutcome("expired")}
              disabled={isSubmitting || isDeleting}
              className="btn-outline-warm"
            >
              失効した
            </button>
          </div>
        )}

        {isEditMode && (
          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            disabled={isSubmitting || isDeleting}
            className="btn-danger"
            style={{ marginTop: 12 }}
          >
            このサービスを削除する
          </button>
        )}
      </form>

      {showDeleteModal && (
        <ConfirmSheet
          title={"「" + (name || "このサービス") + "」を削除しますか?"}
          description="削除すると、元に戻せません。"
          confirmLabel="削除する"
          busyLabel="削除中..."
          variant="danger"
          busy={isDeleting}
          onConfirm={handleDelete}
          onClose={() => setShowDeleteModal(false)}
        />
      )}

      {pendingOutcome && (
        <ConfirmSheet
          title={
            accountType === "continuous"
              ? "「" + (name || "このサービス") + "」の失効を記録しますか?"
              : "「" + (name || "このサービス") + "」を" + (pendingOutcome === "used_up" ? "使いきった" : "失効した") + "ものとして記録しますか?"
          }
          description={accountType === "continuous" ? "残高は0にリセットされます。" : "記録を残します。"}
          confirmLabel="記録する"
          busyLabel="記録中..."
          variant={pendingOutcome === "expired" ? "danger" : "normal"}
          busy={isRecordingOutcome}
          onConfirm={() => handleOutcome(pendingOutcome)}
          onClose={() => setPendingOutcome(null)}
        />
      )}
    </>
  );
}
