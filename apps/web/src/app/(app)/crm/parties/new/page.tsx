'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreatePartyRequest } from '@aurora/types';
import { PageHeader, Panel } from '@aurora/ui';
import { PartyForm } from '../../../../../components/party-form';
import { useT } from '../../../../../lib/i18n';
import { errorMessage, useSession } from '../../../../../lib/session';

export default function NewPartyPage() {
  const t = useT();
  const router = useRouter();
  const qc = useQueryClient();
  const { api } = useSession();
  const mutation = useMutation({
    mutationFn: (input: CreatePartyRequest) => api.createParty(input),
    onSuccess: (party) => {
      void qc.invalidateQueries({ queryKey: ['parties'] });
      router.push(`/crm/parties/${party.id}`);
    },
  });
  return (
    <>
      <PageHeader
        title={t('parties.new')}
        breadcrumb={<Link href="/crm/parties">{t('parties.title')}</Link>}
      />
      <Panel>
        <PartyForm
          onSubmit={(input) => {
            mutation.mutate(input);
          }}
          busy={mutation.isPending}
          serverError={mutation.error ? errorMessage(mutation.error, t).message : undefined}
        />
      </Panel>
    </>
  );
}
