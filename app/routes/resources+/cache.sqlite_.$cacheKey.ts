import { type LoaderFunctionArgs, json } from '@remix-run/node'
import invariant from 'tiny-invariant'
import { cache } from '#app/utils/cache.server.ts'
import {
	ensureInstance,
	getAllInstances,
	getInstanceInfo,
} from '#app/utils/litefs-js.server.ts'
import { requireAdminUser } from '#app/utils/session.server.ts'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireAdminUser(request)
	const searchParams = new URL(request.url).searchParams
	const currentInstanceInfo = await getInstanceInfo()
	const allInstances = await getAllInstances()
	const instance =
		searchParams.get('instance') ?? currentInstanceInfo.currentInstance
	await ensureInstance(instance)

	const { cacheKey } = params
	invariant(cacheKey, 'cacheKey is required')
	return json({
		instance: {
			hostname: instance,
			region: allInstances[instance],
			isPrimary: currentInstanceInfo.primaryInstance === instance,
		},
		cacheKey,
		value: cache.get(cacheKey),
	})
}
