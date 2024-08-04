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
    ```
## 3.  実行(Execution)クライアントをセットアップする

## 4. 

# 参考資料
1. [Presenting the Community Staking Module Testnet](https://blog.lido.fi/presenting-community-staking-testnet/)
2. [Early Adoption for Lido Community Staking Module](https://blog.lido.fi/introducing-early-adoption-for-community-staking-module/)
3. [CSM Testnet UI](https://csm.testnet.fi/)
4. [AWS CDKを使用したAmazon EC2上でのEthereumノードバリデーターの自動展開](https://aws.amazon.com/jp/blogs/news/automate-ethereum-node-validator-deployment-on-amazon-ec2-using-aws-cdk/)