'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PARTY_ROLES, type CreatePartyRequest, type PartyRole } from '@aurora/types';
import { PageHeader, Panel, Skeleton } from '@aurora/ui';
import { PartyForm } from '../../../../../components/party-form';
import { useT } from '../../../../../lib/i18n';
import { errorMessage, useSession } from '../../../../../lib/session';

export default function NewPartyPage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <NewParty />
    </Suspense>
  );
}

function NewParty() {
  const t = useT();
  const router = useRouter();
  const qc = useQueryClient();
  const { api } = useSession();
  const requested = useSearchParams().get('role');
  const initialRole: PartyRole =
    requested && (PARTY_ROLES as readonly string[]).includes(requested)
      ? (requested as PartyRole)
      : 'CUSTOMER';
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
        breadcrumb={
          <Link href={`/crm/parties?role=${initialRole}`}>
            {t(
              initialRole === 'SUPPLIER'
                ? 'parties.titleSuppliers'
                : initialRole === 'PROSPECT'
                  ? 'parties.titleProspects'
                  : 'parties.titleCustomers',
            )}
          </Link>
        }
      />
      <Panel>
        <PartyForm
          onSubmit={(input) => {
            mutation.mutate(input);
          }}
          busy={mutation.isPending}
          initialRole={initialRole}
          serverError={mutation.error ? errorMessage(mutation.error, t).message : undefined}
        />
      </Panel>
    </>
  );
}
