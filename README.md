# lido-csm-testnet
LidoのCSM(Community Staking Module)を試してみるための作業用リポジトリ

# 手順
## 1. テストネットトークンを用意
* [PoW faucet](https://holesky-faucet.pk910.de/)でHoleskyのETHを取得
* 事前設定として、付与先のEVMアドレスのGitcoinスコアを上げる

## 2. ノードとして利用するサーバーを立てる @AWS
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
* 

## 3. キーペアの作成・セットアップ
*  キーペアを作成する
  ```bash
  ssh-keygen -t ed25519 -C ethnode
  ```
*   EC2へアクセスして上記公開鍵を配置する
  ```bash
  sudo mkdir -p ~/.ssh
  sudo nano ~/.ssh/authorized_keys
  ```

## 4. 実行(Execution)クライアントをセットアップする(Geth)
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
  * geth.serviceファイルの記述例
    ```
    [Unit]
    Description=Geth Execution Client (Holesky)
    After=network.target
    Wants=network.target

    [Service]
    User=ec2-user
    ExecStart=/home/ec2-user/go-ethereum/build/bin/geth --datadir /home/ec2-user/gethdata/.ethereum --holesky --http --http.addr "0.0.0.0" --http.port 8545 --http.corsdomain "*" --http.api "eth,net,web3,personal" --syncmode "full" --cache=2048 --port 30303 --pprof --metrics --authrpc.jwtsecret=/var/lib/jwtsecret/jwt.hex
    Restart=always
    RestartSec=30

    [Install]
    WantedBy=default.target
    ```
* systemctlで実行する
  ```
  sudo systemctl daemon-reload
  sudo systemctl start geth.service
  sudo systemctl status geth.service
  ```
  * 3行目のコード実行後、ステータスが'active (running)'であり、ブロックの同期が始まれば成功
* インスタンスを再起動した際にも実行されるよう設定
  ```bash
  sudo systemctl enable geth
  sudo systemctl start geth
  ```

## 4. 

# 参考資料
1. [Presenting the Community Staking Module Testnet](https://blog.lido.fi/presenting-community-staking-testnet/)
2. [Early Adoption for Lido Community Staking Module](https://blog.lido.fi/introducing-early-adoption-for-community-staking-module/)
3. [CSM Testnet UI](https://csm.testnet.fi/)
4. [AWS CDKを使用したAmazon EC2上でのEthereumノードバリデーターの自動展開](https://aws.amazon.com/jp/blogs/news/automate-ethereum-node-validator-deployment-on-amazon-ec2-using-aws-cdk/)
5. [Command-line Options | go-ethereum](https://geth.ethereum.org/docs/fundamentals/command-line-options)