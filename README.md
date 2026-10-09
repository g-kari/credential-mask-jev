# credential-mask-jev

外部AIへ渡す前に、ローカルで機密候補を検出し、ランダムな仮名へ置き換える可逆マスキングMVPです。復元は対応表にある完全一致トークンだけをコードで戻します。

**完全な匿名化・機密検出を保証するツールではありません。候補を原文と照合し、人が確認してから export してください。** 氏名・住所・社内固有情報は、標準のルールだけでは見逃します。モデルの高い confidence も安全証明ではありません。

## できること

- メール、一般的な日本の電話番号、郵便番号、秘密鍵ブロック、代表的なトークン形式、Bearer/JWT、URL内認証情報、ラベル付き秘密情報を候補化
- 会員ID・顧客番号・注文番号を日本語/英語の項目名から検出。汎用 id は曖昧な候補として扱う。個数・価格などの数字全般は一括で隠さない
- 同じ文書・同じカテゴリ・同じ原文値は同じランダムトークン。会員ID=123 と 注文番号=123 は別トークン。別セッションでは新しいトークン。表記揺れや同名人物の同一性は推測しない
- サービス固有の項目名・安全な接頭辞形式を追加可能。任意の正規表現実行は設定に含めない
- 原文ハッシュ付き手動範囲、または実験的なローカル djev spans で追加候補を検出。LLMがルールの候補を取り消すことはできない
- preview → 明示的な確認付き export → ローカル restore。外部AIへの自動送信は実装しない

UTF-8のプレーンテキストが対象です。JSONもテキストとして扱うため、数値IDを置換した候補は有効なJSONではなくなる場合があります。PDF/Office/画像/バイナリ、構造を保つJSON変換、ブラウザ拡張、日本語NER、モデル配布、暗号化保存はこのMVPに含みません。

## 実行

Python 3.10以上。実行時依存は標準ライブラリのみ。チェックアウトしたディレクトリで、インストールせずに実行できます。

```sh
python -m credential_mask --help
python -m unittest discover -v
python -m compileall -q credential_mask tests
```

### 合成データで試す

以下は**ローカルに原文を含む平文の対応表を保存します**。ディスク暗号化された、他のユーザーから書き換えられない、同期・バックアップ対象外の私的な作業場所で実行してください。session、入力、対応表、復元結果を外部AIやGitに送らないでください。

```sh
python -m credential_mask prepare \
  --input examples/synthetic-ja.txt \
  --manual-spans examples/synthetic-ja.spans.json \
  --rules examples/domain-rules.json \
  --session .mask-session-demo \
  --allow-plaintext-map
```

`.mask-session-demo/candidate.txt` と原文をローカルのエディタで比較してください。`review.json` には位置・種類・件数と未確認の注意だけを入れ、原文値や抜粋は入れません。会員と注文のつながり、見逃した名前・住所・出来事、過剰マスクも確認します。追加が必要なら元の文書に対する手動範囲を直し、**新しい session** を prepare してください。候補を直接編集すると整合性検査で停止します。

```sh
python -m credential_mask export \
  --session .mask-session-demo \
  --output demo.masked.txt \
  --approve-reviewed
```

`--approve-reviewed` は人が原文と候補を確認したという明示的な申告です。検出の完全性を機械的に判定するフラグではありません。外部AIへ渡すのは確認した `demo.masked.txt` だけです。対応表は渡しません。

外部AIの返答をローカルの `answer.txt` に保存したら、完全一致トークンを復元できます。動作確認だけなら、`--input demo.masked.txt` を使うと元の合成文書が戻ります。

```sh
python -m credential_mask restore \
  --session .mask-session-demo \
  --input answer.txt \
  --output answer.restored.txt
```

既存ファイルは上書きしません。未知のトークンや認識できる壊れたトークンは推測せず停止します。AIがトークンを省略した場合は新しい情報を生成しません。完全に書き換えられた記号は通常の文章と区別できない場合があります。復元結果は再び機密データです。

### 保存をしないAPI

Python APIは対応表をメモリにだけ保持します。インポート・mask・restore はネットワーク接続やファイル保存をしません。

```python
from credential_mask import mask

original = "会員ID: M-DEMO-001\n注文番号: O-DEMO-101"
session = mask(original)
candidate = session.masked  # 人が原文と比較してから使用
assert session.restore(candidate) == original
```

session/mappingのreprやダンプには原文が含まれます。ログに出さないでください。メモリAPIでもOSスワップ、クラッシュダンプ、同一ユーザーの別プロセスへの保護は保証しません。

### Windows等

POSIXでは新しいsessionを0700、ファイルを0600にし、読み込み時にも他ユーザーへの権限を確認します。これは暗号化ではありません。Windowsでは0600/0700は安全なACLの保証にならないため、保存コマンドは標準で停止します。

保存が必要なら、自分でACLとディスク暗号化を確認した私的な場所を指定したうえで、各コマンドに `--ack-unprotected-storage` を追加します。ツールはWindows ACLを設定・検証しません。メモリAPIならこの保存用フラグは不要です。

## 手動範囲とドメインルール

範囲は**原文そのもののPython Unicodeコードポイント位置**で、startを含みendを含みません。UTF-8バイト位置やJavaScript UTF-16位置は使いません。改行やUnicode正規化を変更したら作り直します。

```json
{
  "source_sha256": "原文UTF-8のSHA256を64桁hexで指定",
  "spans": [{"start": 4, "end": 8, "category": "person"}]
}
```

サンプルの `examples/synthetic-ja.spans.json` は合成文書だけに対応します。`examples/domain-rules.json` は追加項目名と接頭辞＋文字集合＋長さの例です。形式から外れた値はルールで拾えないため、確認が必要です。任意の数字をIDと決めつけません。会員・注文等の種類を跨いで同一視する設定はありません。

## ローカルJev系モデル（任意・実験的）

標準動作は `regex-only`。公式Jevの重みを配布・使用するものではありません。[mmastrac/djev](https://github.com/mmastrac/djev#span-answers) の `/v1/systemone` + `spans` 拡張に合わせたアダプターです。[githubnext/localjev](https://github.com/githubnext/localjev) 等の通常のChoice/Score/NoulだけのAPIには、そのまま接続できません。日本語の検出再現率は未測定です。

既にローカルで動作する対応サーバーを利用するときだけ、明示的に指定します。ツールはモデルのダウンロード、サーバーの導入・起動、モデル探索を行いません。

```sh
python -m credential_mask prepare \
  --input examples/synthetic-ja.txt \
  --session .mask-session-local-model \
  --allow-plaintext-map \
  --djev-url http://127.0.0.1:8011 \
  --model YOUR_ALREADY_SERVED_MODEL_NAME \
  --ack-local-server
```

この指定は**原文をそのローカルサーバーへ渡す**ことを意味します。サーバーの上流もローカルで、原文/生成/デバッグログを保存しない構成であることを自分で確認してください。loopbackで待ち受けていても、サーバーが外部へ中継する可能性はこのクライアントだけでは防げません。APIキー入力・保存は対応しません。

- 接続先は数字のloopbackアドレスのHTTP originだけ。localhost/DNS、外部/LANアドレス、URL内認証、パス、クエリ、リダイレクトを拒否。環境・OSのプロキシを無効化
- 返却された全範囲を元の文字列と完全照合。低confidence/coverage、欠けた質問、明示的な失敗/不完全フラグ、上限に達したリストを拒否。失敗時にルールのみへ自動切替しない
- 上限超過で文字列を切り捨てない。原文は1MiB、モデル入力は8192コードポイント、モデル返答は2MiB、候補/復元出力は8MiBが上限
- djevの上流はspan-list内で低信頼候補を省略し、完全性/無言のcanvas打ち切りを常に報告するAPIではない。空の結果や高confidenceでも見逃し得るため、**毎回の人による照合を必須**とする

参考: [公式Jevの候補抽出設計](https://docs.typesafe.ai/cookbooks/pre_parsed_value_extraction_cookbook)、[言語サポート](https://docs.typesafe.ai/models#language-support)。抽出/判定と置換/復元を分離します。

## 検証と安全性

`tests/` は合成データのみ。日本語/絵文字/結合文字/CRLFの完全復元、型別ID、JSON内ID、重複、包含/交差、エスケープ付き文字列、長いID、トークン衝突/未知/破損、対応表の誤編集、制限、同意、ファイル保護、プロキシ/リダイレクト拒否、モデル失敗を検査します。

djev通信はドキュメント/ソースに基づくレスポンスfixtureとmockで検証します。実モデルや実サーバーを使う結合テスト、日本語検出のprecision/recall評価ではありません。CIはLinux/WindowsとPython 3.10/3.12/3.13の合成テストです。POSIX専用検査はWindowsでskipします。

詳細は [SECURITY.md](SECURITY.md) と [docs/EVALUATION.md](docs/EVALUATION.md)。見逃しや再識別を防ぎ切れず、平文対応表にもリスクがあります。機密原文・対応表をissue/PR/ログに貼らないでください。
