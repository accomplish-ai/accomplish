import { BedrockClient } from '@aws-sdk/client-bedrock';

export type BedrockClientCredentials = NonNullable<
  ConstructorParameters<typeof BedrockClient>[0]
>['credentials'];

export async function resolveFromIni(): Promise<
  (args: { profile?: string }) => BedrockClientCredentials
> {
  const credentialProvidersModule = (await import('@aws-sdk/credential-providers')) as {
    fromIni?: (args: { profile?: string }) => BedrockClientCredentials;
    default?: { fromIni?: (args: { profile?: string }) => BedrockClientCredentials };
  };

  const fromIni = credentialProvidersModule.fromIni ?? credentialProvidersModule.default?.fromIni;
  if (!fromIni) {
    throw new Error('AWS credential providers package does not expose fromIni');
  }

  return fromIni;
}
