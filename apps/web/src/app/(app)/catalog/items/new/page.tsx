'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateItemRequest } from '@aurora/types';
import { ErrorState, PageHeader, Panel, Skeleton } from '@aurora/ui';
import { ItemForm } from '../../../../../components/item-form';
import { useT } from '../../../../../lib/i18n';
import { errorMessage, useSession } from '../../../../../lib/session';

export default function NewItemPage() {
  const t = useT();
  const router = useRouter();
  const qc = useQueryClient();
  const { api, capabilities } = useSession();
  const categories = useQuery({
    queryKey: ['item-categories'],
    queryFn: () => api.itemCategories(),
  });
  const uoms = useQuery({ queryKey: ['uoms'], queryFn: () => api.uoms() });
  const mutation = useMutation({
    mutationFn: (input: CreateItemRequest) => api.createItem(input),
    onSuccess: (item) => {
      void qc.invalidateQueries({ queryKey: ['items'] });
      router.push(`/catalog/items/${item.id}`);
    },
  });
  if (categories.isPending || uoms.isPending) return <Skeleton />;
  if (categories.error || uoms.error)
    return <ErrorState {...errorMessage(categories.error ?? uoms.error, t)} />;
  return (
    <>
      <PageHeader
        title={t('items.new')}
        breadcrumb={<Link href="/catalog/items">{t('items.title')}</Link>}
      />
      <Panel>
        <ItemForm
          categories={categories.data}
          uoms={uoms.data}
          enabledModules={capabilities?.modules ?? []}
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
