import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam'
import * as path from 'path';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import { Construct } from 'constructs';
import { aws_ssm as ssm } from 'aws-cdk-lib';
import { InitFile } from 'aws-cdk-lib/aws-ec2';

declare const content: any;

export class CdkRocketpoolValidatorStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const cfnDocument = new ssm.CfnDocument(this, 'RocketPoolSessionManagerDocument', {
      content: {
        "schemaVersion":"1.0",
        "description":"Rocket Pool node Session Manager Configurations",
        "sessionType":"Standard_Stream",
        "inputs":{
          "runAsEnabled": true,
          "runAsDefaultUser": "ec2-user",
          "idleSessionTimeout":"20",
          "shellProfile":{
              "linux":"cd ~ && bash"
           }
        }
     },
      name: 'SSM-RocketPoolConfiguration',
      documentFormat: 'JSON',
      documentType: 'Session'
    });

    // Create new VPC with 2 Subnets
    const vpc = new ec2.Vpc(this, 'VPC', {
      natGateways: 0,
      subnetConfiguration: [{
        cidrMask: 24,
        name: "asterisk",
        subnetType: ec2.SubnetType.PUBLIC
      }]
    });

    // Allow outbound access
    // No port 22 access, connections managed by AWS Systems Manager Session Manager
    // Inbound access rules for Rocketpool set below

    const securityGroup = new ec2.SecurityGroup(this, 'SecurityGroup', {
      vpc,
      description: 'Rocketpool validator node security group.',
      allowAllOutbound: true
    });

    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'allow HTTPS traffic from anywhere',
    );

    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcpRange(9100, 9104),
      'allow Beacon Node metrics port: 9100 - 9104',
    );

    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(9091),
      'allow Prometheus port: 9091',
    );
    
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(3100),
      'allow Grafana port: 3100',
    );

    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(5051),
      'allow lighthouse port: 5051',
    );

    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(8545),
      'allow geth port: 8545',
    );

    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(8551),
      'allow lighthouse port: 8551',
    );

    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(8546),
      'allow geth port: 8546 (WebSocket)',
    );

    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(9001),
      'allow ETH2 P2P port: 9001',
    );

    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(30303),
      'allow ETH1 P2P port: 30303',
    );

    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(18550),
      'allow lighthouse port: 18550',
    );

    const role = new iam.Role(this, 'ec2Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com')
    })

    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'))

    // Use Latest Amazon Linux Image - CPU Type ARM64
    const ami = new ec2.AmazonLinuxImage({
      generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      cpuType: ec2.AmazonLinuxCpuType.ARM_64
    });

    const rootVolume: ec2.BlockDevice = {
      deviceName: '/dev/xvda', // Use the root device name
      volume: ec2.BlockDeviceVolume.ebs(2048), // Override the volume size in Gibibytes (GiB) - 2TB for RPL
    };

    // Create the instance using the Security Group, AMI, and KeyPair defined in the VPC created
    const ec2Instance = new ec2.Instance(this, 'Instance', {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.C6G, ec2.InstanceSize.XLARGE2),
      machineImage: ami,
      securityGroup: securityGroup,
      role: role,
      blockDevices: [rootVolume]
    });

    // Upload Private Key to S3
    const privateKeyAsset = new cdk.aws_s3_assets.Asset(
      this,
      'privateKeyAsset',
      {
        path: path.join(__dirname, '../../../03_GenerateKeys/staking_deposit-cli-fdab65d-darwin-amd64/validator_keys'),
      }
    );

    // SSM Parameter
    const privateKeyAssetS3UriParameter = new cdk.aws_ssm.StringParameter(
      this,
      'privateKeyAssetS3UriParameter',
      {
        parameterName: `/lido-csm/asset/s3-uri`,
        stringValue: privateKeyAsset.s3ObjectUrl,
      }
    );
    privateKeyAsset.grantRead(ec2Instance);
    privateKeyAssetS3UriParameter.grantRead(ec2Instance);

    // Create outputs for connecting
    new cdk.CfnOutput(this, 'IP Address', { value: ec2Instance.instancePublicIp });
    new cdk.CfnOutput(this, 'ssh command', { value: 'aws ssm start-session --target ' + ec2Instance.instanceId + ' --document-name SSM-RocketPoolConfiguration'});
  }
}
