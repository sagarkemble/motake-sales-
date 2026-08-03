import type { RouterInputs } from "@repo/trpc/client";

import { trpc } from "~/trpc/client";

import { emptyPaginatedResult } from "./shared/pagination";

interface UseProductsParams {
  listFilters?: RouterInputs["products"]["list"];
  productId?: string;
  enabled?: boolean;
}

export function useProducts({ listFilters, productId, enabled = true }: UseProductsParams = {}) {
  const utils = trpc.useUtils();

  const productsListQuery = trpc.products.list.useQuery(listFilters ?? { page: 1, pageSize: 20 }, {
    enabled: enabled && Boolean(listFilters),
  });
  const productQuery = trpc.products.getById.useQuery(
    { id: productId ?? "" },
    { enabled: enabled && Boolean(productId) },
  );
  const productVarietiesQuery = trpc.products.listVarieties.useQuery(
    { productId: productId ?? "" },
    { enabled: enabled && Boolean(productId) },
  );

  const createProductMutation = trpc.products.create.useMutation({
    onSuccess: () => utils.products.invalidate(),
  });
  const updateProductMutation = trpc.products.update.useMutation({
    onSuccess: () => utils.products.invalidate(),
  });
  const deactivateProductMutation = trpc.products.deactivate.useMutation({
    onSuccess: () => utils.products.invalidate(),
  });
  const createProductVarietyMutation = trpc.products.createVariety.useMutation({
    onSuccess: () => utils.products.invalidate(),
  });
  const updateProductVarietyMutation = trpc.products.updateVariety.useMutation({
    onSuccess: () => utils.products.invalidate(),
  });
  const deactivateProductVarietyMutation = trpc.products.deactivateVariety.useMutation({
    onSuccess: () => utils.products.invalidate(),
  });

  return {
    productsPage: productsListQuery.data?.data ?? emptyPaginatedResult(listFilters?.page, listFilters?.pageSize),
    isProductsListLoading: productsListQuery.isLoading,
    isProductsListError: productsListQuery.isError,
    refetchProductsList: productsListQuery.refetch,

    product: productQuery.data?.data ?? null,
    isProductLoading: productQuery.isLoading,
    isProductError: productQuery.isError,
    refetchProduct: productQuery.refetch,

    productVarieties: productVarietiesQuery.data?.data ?? [],
    isProductVarietiesLoading: productVarietiesQuery.isLoading,
    isProductVarietiesError: productVarietiesQuery.isError,
    refetchProductVarieties: productVarietiesQuery.refetch,

    createProduct: createProductMutation.mutate,
    createProductAsync: createProductMutation.mutateAsync,
    isCreatingProduct: createProductMutation.isPending,
    createProductError: createProductMutation.error ?? null,

    updateProduct: updateProductMutation.mutate,
    updateProductAsync: updateProductMutation.mutateAsync,
    isUpdatingProduct: updateProductMutation.isPending,
    updateProductError: updateProductMutation.error ?? null,

    deactivateProduct: deactivateProductMutation.mutate,
    deactivateProductAsync: deactivateProductMutation.mutateAsync,
    isDeactivatingProduct: deactivateProductMutation.isPending,
    deactivateProductError: deactivateProductMutation.error ?? null,

    createProductVariety: createProductVarietyMutation.mutate,
    createProductVarietyAsync: createProductVarietyMutation.mutateAsync,
    isCreatingProductVariety: createProductVarietyMutation.isPending,
    createProductVarietyError: createProductVarietyMutation.error ?? null,

    updateProductVariety: updateProductVarietyMutation.mutate,
    updateProductVarietyAsync: updateProductVarietyMutation.mutateAsync,
    isUpdatingProductVariety: updateProductVarietyMutation.isPending,
    updateProductVarietyError: updateProductVarietyMutation.error ?? null,

    deactivateProductVariety: deactivateProductVarietyMutation.mutate,
    deactivateProductVarietyAsync: deactivateProductVarietyMutation.mutateAsync,
    isDeactivatingProductVariety: deactivateProductVarietyMutation.isPending,
    deactivateProductVarietyError: deactivateProductVarietyMutation.error ?? null,
  };
}
