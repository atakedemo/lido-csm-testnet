# lido-csm-testnet
LidoのCSM(Community Staking Module)を試してみるための作業用リポジトリ

# 手順
## 1. テストネットトークンを用意
* [PoW faucet](https://holesky-faucet.pk910.de/)でHoleskyのETHを取得
* 事前設定として、付与先のEVMアドレスのGitcoinスコアを上げる

## 2. バリデータ用のキーペア作成
* バイナリファイルのインストール（Mac OSのローカルデバイスにて実施）
  ```bash
  curl -LO https://github.com/ethereum/staking-deposit-cli/releases/download/staking_deposit-cli-fdab65d-darwin-amd64.tar.gz
  echo "8f33bdb78dfbe334ac25d4d5146bb58a43a06b4f3ab02268ceaf003de1ebc4c3 staking_deposit-cli-fdab65d-darwin-amd64.tar.gz" | sha256sum --check
  ```

* バイナリファイルを解凍する
  ```bash
  tar xvf staking_deposit-cli-fdab65d-darwin-amd64.tar.gz
  ```
* 鍵ファイルを生成
  ```bash
  ./deposit new-mnemonic --num_validators 1 --chain holesky --eth1_withdrawal_address 0xF0179dEC45a37423EAD4FaD5fCb136197872EAd9
  ```

## ３. ノードとして利用するサーバーを立てる @AWS
* 必要リソースのインストール
  ```bash
  # Clone the demo CDK application code
  git clone https://github.com/aws-samples/cdk-rocketpool-validator-node

  # Change directory
  cd cdk-rocketpool-validator-node

  # Install the CDK application
  npm install
  ```
* CDKコードの変更（[cdk-rocketpool-validator-stack.ts](./01_Node_on_AWS/guidance-for-automating-ethereum-node-validator-using-graviton-on-aws/lib/cdk-rocketpool-validator-stack.ts)を編集）
  * EC2は立てるまで（124行目〜149行目をコメントアウト）
    ```typescript
    // // Create an asset that will be used as part of User Data to run on first load
    // const config = new Asset(this, 'Config', { path: path.join(__dirname, '../src/config.sh') });
    // const configPath = ec2Instance.userData.addS3DownloadCommand({
    //   bucket: config.bucket,
    //   bucketKey: config.s3ObjectKey
    // });
    // ec2Instance.userData.addExecuteFileCommand({
    //   filePath: configPath,
    //   arguments: '--verbose -y'
    ~~
    ```
* AWSリソースのデプロイ
  ```bash
  cdk deploy
  ```

* EC2にアクセスできることを確認する
  1. AWSマネジメントコンソールにアクセス
  2. EC2のコンソールへ移動
  3. "CdkRocketpoolValidatorStack/Instance" のインスタンスを選択し、「選択」を押下
  4. 「セッションマネージャー」のメニューから接続
* X

## 4.Executionクライアントをセットアップする(Geth)
* JWTファイルを生成（後続手順で利用）
  ```bash
  sudo mkdir -p /var/lib/jwtsecret
  openssl rand -hex 32 | sudo tee /var/lib/jwtsecret/jwt.hex > /dev/null
  ```
* Gethクライアントをインストールする（ec2-userディレクトリで実行）
  ```bash
  sudo su
  cd /home/ec2-user
  sudo yum install -y golang
  git clone https://github.com/ethereum/go-ethereum.git
  cd go-ethereum
  make geth
  ```
* データを格納するディレクトリを生成し、Gethクライアントの実行ユーザーに権限を付与する
  ```bash
  mkdir /home/ec2-user/gethdata/
  mkdir /home/ec2-user/gethdata/.ethereum
  sudo chown -R ec2-user:ec2-user /home/ec2-user/gethdata/
  ```
  * 注1：2行目の 'ec2-user:ec2-user' をGethクライアントを実行するユーザー・ユーザーグループにする（上記では、ec2-user）を利用
  * 注2：2行目の権限変更がないと、後続でGethを実行した際に、下記エラーコードを吐いて、systemctlコマンドが永遠に再実行されることとなる
    ```bash
    Aug 11 01:46:13 ip-10-0-0-26.ap-northeast-1.compute.internal systemd[1]: Unit geth.service entered failed state.
    Aug 11 01: 46:13 ip-10-0-0-26.ap-northeast-1.compute.internal systemd[1]: geth.service failed. 
    ```
*  Gethクライアントを実行する
  ```bash
  /home/ec2-user/go-ethereum/build/bin/geth --datadir /home/ec2-user/gethdata/.ethereum --holesky --http --http.addr "0.0.0.0" --http.port 8545 --http.corsdomain "*" --http.api "eth,net,web3,personal" --syncmode "full" --cache=2048 --port 30303 --pprof --metrics --authrpc.jwtsecret=/var/lib/jwtsecret/jwt.hex 
  ```
* systemctlで実行できるよう、設定ファイルを生成する
  * 下記コマンドを実行し、geth.serviceファイルを生成する
    ```bash
    sudo nano /etc/systemd/system/geth.service
    ```
  * geth.serviceファイルの記述例（各パラメータは[Gethのドキュメント](https://geth.ethereum.org/docs/fundamentals/command-line-options)を参照）
    ```
    [Unit]
    Description=Geth Execution Client (Holesky)
    After=network.target
    Wants=network.target

    [Service]
    User=ec2-user
    ExecStart=/home/ec2-user/go-ethereum/build/bin/geth --datadir /home/ec2-user/gethdata/.ethereum --holesky --http --http.addr 127.0.01 --http.port 8545 --http.corsdomain "*" --http.api "eth,net,web3,personal" --syncmode "full" --cache=2048 --port 30303 --pprof --metrics --authrpc.jwtsecret=/var/lib/jwtsecret/jwt.hex --ws --http.api "eth,net,web3,personal,engine" --authrpc.addr 127.0.0.1 --authrpc.port 8551 --authrpc.vhosts 127.0.0.1
    Restart=always
    RestartSec=30

    [Install]
    WantedBy=default.target
    ```
* systemctlで実行する
  ```
  sudo systemctl daemon-reload
  sudo systemctl start geth.service
  sudo systemctl status geth.service -l
  ```
  * 3行目のコード実行後、ステータスが'active (running)'であり、ブロックの同期が始まれば成功
* インスタンスを再起動した際にも実行されるよう設定
  ```bash
  sudo systemctl enable geth
  sudo systemctl start geth
  ```
* 下記方法にて、Gethが正常に動いているか確認する
  * ブロックの同期状況の確認
    ```bash
    /home/ec2-user/go-ethereum/build/bin/geth attach --exec eth.syncing --datadir /home/ec2-user/gethdata/.ethereum
    ```

    ※出力結果
    ```bash
    # 同期が完了していない場合（cunnrentBlock: 同期済、heghestBlock: 現在の最新ブロック）
    {
      currentBlock: 506087,
      healedBytecodeBytes: 0,
      healedBytecodes: 0,
      healedTrienodeBytes: 0,
      healedTrienodes: 0,
      healingBytecode: 0,
      healingTrienodes: 0,
      highestBlock: 2200815,
      startingBlock: 0,
      syncedAccountBytes: 0,
      syncedAccounts: 0,
      syncedBytecodeBytes: 0,
      syncedBytecodes: 0,
      syncedStorage: 0,
      syncedStorageBytes: 0,
      txIndexFinishedBlocks: 504159,
      txIndexRemainingBlocks: 0
    }

    # 同期が完了している場合
    false
    ```
  * 実行レイヤーとしてRPC APIを実行できるか（残高取得のAPIを実行）
    ```bash
    curl --data '{"jsonrpc":"2.0","method":"eth_getBalance", "params": ["0x005E687c58e498bF6E6068868Fa6c03D9E806C2C", "latest"], "id":2}' -H "Content-Type: application/json" 127.0.0.1:8545
    ```
  * Lighthouseからの問い合わせチャネルが開いているかの確認
    ```bash
    curl --data '{"jsonrpc":"2.0","method":"engine_exchangeCapabilities", "params": ["engine_exchangeTransitionConfigurationV1","engine_forkchoiceUpdatedV1","engine_getPayloadBodiesByHash","engine_getPayloadBodiesByRangeV1","engine_getPayloadV1","engine_newPayloadV1"], "id":2}' -H "Content-Type: application/json" 127.0.0.1:8545
    ```
## 5. Consensusクライアントをセットアップする（Lighthouse）
* Rustをインストール
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  source $HOME/.cargo/env
  rustc --version
  ```
* 必要ライブラリのインストール
  * 各種ライブラリ
    ```bash
    sudo yum groupinstall "Development Tools" -y
    sudo yum install gcc-c++ -y
    sudo yum install -y openssl-devel
    sudo yum install -y perl-IPC-Cmd
    sudo yum install -y perl-core
    ```
  * cmakeの最新版をインストール（これを行わないとlighthouseのインストールでつまづく）
    ```bash
    wget https://cmake.org/files/v3.26/cmake-3.26.4.tar.gz
    tar -zxvf cmake-3.26.4.tar.gz
    cd cmake-3.26.4

    ./bootstrap
    make
    sudo make install
    export PATH=/usr/local/bin:$PATH
    ```
* Lighthouseのインストール
  ```bash
  cd /home/ec2-user
  git clone https://github.com/sigp/lighthouse.git
  cd lighthouse
  make
  ```
* ディレクトリ生成
  ```bash
  sudo mkdir -p /var/lib/lighthouse_beacon
  sudo chown -R ec2-user:ec2-user /var/lib/lighthouse_beacon
  sudo chmod 700 /var/lib/lighthouse_beacon
  ```

* systemctlで実行できるよう、設定ファイルを生成する
  * 下記コマンドを実行し、lighthousebeacon.serviceファイルを生成する
    ```bash
    sudo nano /etc/systemd/system/lighthousebeacon.service
    ```
  * lighthousebeacon.serviceファイルの記述例
    ```bash
    [Unit]
    Description=Lighthouse Beacon Node (Holesky)
    Wants=network-online.target
    After=network-online.target

    [Service]
    User=ec2-user
    Group=ec2-user
    Type=simple
    Restart=always
    RestartSec=30
    ExecStart=/home/ec2-user/lighthouse/target/release/lighthouse bn --network holesky --datadir /var/lib/lighthouse_beacon --execution-endpoint http://127.0.0.1:8551 --execution-jwt /var/lib/jwtsecret/jwt.hex --checkpoint-sync-url=https://holesky.beaconstate.ethstaker.cc/ --metrics --metrics-port 3100 --validator-monitor-auto --port 9001 --http --http-port 5051 --builder http://127.0.0.1:18550

    [Install]
    WantedBy=multi-user.target
    ```
* systemctlで実行する
  ```
  sudo systemctl daemon-reload
  sudo systemctl start lighthousebeacon.service
  sudo systemctl status lighthousebeacon.service -l
  ```
* インスタンスを再起動した際にも実行されるよう設定
  ```bash
  sudo systemctl enable lighthousebeacon.service
  sudo systemctl restart lighthousebeacon.service
  ```

## 6. バリデータ設定
* #1で生成した鍵ファイルを取得する
  ```bash
  asset_s3_uri=$(aws ssm get-parameter --name "/lido-csm/asset/s3-uri" --query "Parameter.Value" --output text --region ap-northeast-1)
  # パスが取得できていることを確認
  echo $asset_s3_uri
  cd /home/ec2-user
  aws s3 cp $asset_s3_uri ./
  sudo unzip ./asset.zip
  rm -rf asset.zip
  ```
* 鍵ファイルを配置する
  ```bash
  mkdir validator_keys
  mv deposit_data-NNNNNN.json validator_keys/
  mv keystore-m_NNNNN_NNNN_N_N_N-NNNNNNNN.json validator_keys/
  sudo cp -r validator_keys ~
  ```
* パスワードを設定するファイルを生成（後の手順で利用）。#1で生成した際のパスワードを書き込む
  ```bash
  sudo nano pw.txt
  ```
* 鍵ファイルを配置
  ```bash
  sudo mkdir -p /var/lib/lighthouse_validator
  sudo /home/ec2-user/lighthouse/target/release/lighthouse account validator import --network holesky --datadir /var/lib/lighthouse_validator --directory=$HOME/validator_keys
  # #1で設定したパスワードを入力
  ```

  下記出力を得られることが期待値
  ```bash
  Running account manager for holesky network
  validator-dir path: "/var/lib/csm_lighthouse_validator/validators"
  WARNING: DO NOT USE THE ORIGINAL KEYSTORES TO VALIDATE WITH ANOTHER CLIENT, OR YOU WILL GET SLASHED.

  Keystore found at "/root/validator_keys/keystore-m_12381_3600_0_0_0-1723874458.json":

  - Public key: 0xb3fa2e9d0b7243c93c05b81c0bdb1343833fa957c16fffa8f856e9115605efa52c668913327517931b488be5305e5dac
  - UUID: 4d7e1304-0ab4-492d-ac1a-b1370092de12

  If you enter the password it will be stored as plain-text in validator_definitions.yml so that it is not required each time the validator client starts.

  Enter the keystore password, or press enter to omit it:

  Password is correct.

  Successfully imported keystore.
  Successfully updated validator_definitions.yml.

  Successfully imported 1 validators (0 skipped).
  ```
  
* 新たに生成されたディレクトリの権限を付与する
  ```bash
  sudo chown -R ec2-user:ec2-user /var/lib/lighthouse_validator
  sudo chmod 700 /var/lib/lighthouse_validator
  ```
* 実行ファイルを生成
  * "lighthousevalidator.service" を新規作成する
    ```bash
    sudo nano /etc/systemd/system/lighthousevalidator.service
    ```
  * 下記内容を記載の上、保存する（各パラメータは[Lido提供のドキュメント](https://dvt-homestaker.stakesaurus.com/native-solo-staking-setup/validator-client-setup/lighthouse-vc#configure-the-validator-client-service)を参照）
    ```bash
    [Unit]
    Description=CSM Lighthouse Validator Client (Holesky)
    Wants=network-online.target
    After=network-online.target

    [Service]
    User=ec2-user
    Group=ec2-user
    Type=simple
    Restart=always
    RestartSec=30
    ExecStart=/home/ec2-user/lighthouse/target/release/lighthouse vc --network holesky --datadir /var/lib/lighthouse_validator --builder-proposals --beacon-nodes http://127.0.0.1:5051 --metrics --metrics-port 8081 --suggested-fee-recipient 0xE73a3602b99f1f913e72F8bdcBC235e206794Ac8 --graffiti="bamb00.eth" --enable-doppelganger-protection

    [Install]
    WantedBy=multi-user.target
    ```
* systemctlでバリデータノードを起動
  ```bash
  sudo systemctl daemon-reload
  sudo systemctl start lighthousevalidator.service
  sudo systemctl status lighthousevalidator.service -l
  ```
* 再起動時に実行されるよう設定
  ```bash
  sudo systemctl enable lighthousevalidator.service
  sudo systemctl restart lighthousevalidator.service
  ```

## 7.Mev-Boost 設定
* Mev-Boostのインストール
  ```bash
  cd /home/ec2-user
  git clone https://github.com/flashbots/mev-boost.git
  cd mev-boost
  git checkout tags/v1.7-alpha1
  make build
  sudo cp mev-boost /usr/local/bin
  ```
* 実行ファイルを生成
  * "mevboost.service" を新規作成する
    ```bash
    sudo nano /etc/systemd/system/mevboost.service
    ```
  * "mevboost.service"ファイルの記述例
    ```bash
    [Unit]
    Description=mev-boost (Holesky)
    Wants=network-online.target
    After=network-online.target

    [Service]
    Type=simple
    User=ec2-user
    Group=ec2-user
    Restart=always
    RestartSec=30
    ExecStart=/usr/local/bin/mev-boost -holesky -relay-check -relay https://0xb1559beef7b5ba3127485bbbb090362d9f497ba64e177ee2c8e7db74746306efad687f2cf8574e38d70067d40ef136dc@relay-stag.ultrasound.money/ -relay http://0x821f2a65afb70e7f2e820a925a9b4c80a159620582c1766b1b09729fec178b11ea22abb3a51f07b288be815a1a2ff516@testnet.relay-proxy.blxrbdn.com:18552/ -addr 127.0.0.1:18550

    [Install]
    WantedBy=multi-user.target
    ```
* systemctlでMev-Boostを実行
  ```bash
  sudo systemctl daemon-reload
  sudo systemctl start mevboost
  sudo systemctl status mevboost.service
  ```
* 再起動時も実行できるよう設定
  ```bash
  systemctl enable mevboost
  systemctl restart mevboost
  ```

## 8.X

# 参考資料
1. [Presenting the Community Staking Module Testnet](https://blog.lido.fi/presenting-community-staking-testnet/)
2. [Early Adoption for Lido Community Staking Module](https://blog.lido.fi/introducing-early-adoption-for-community-staking-module/)
3. [CSM Testnet UI](https://csm.testnet.fi/)
4. [AWS CDKを使用したAmazon EC2上でのEthereumノードバリデーターの自動展開](https://aws.amazon.com/jp/blogs/news/automate-ethereum-node-validator-deployment-on-amazon-ec2-using-aws-cdk/)
5. [AWS CDK の aws_s3_assets モジュールを使ってアップロードしたアセットを、EC2 インスタンスにダウンロード可能にしてみた | DevelopersIO](https://dev.classmethod.jp/articles/trying-to-enable-download-of-assets-uploaded-with-aws-cdk-aws_s3_assets-on-ec2-instance/)
6. [Command-line Options | go-ethereum](https://geth.ethereum.org/docs/fundamentals/command-line-options)