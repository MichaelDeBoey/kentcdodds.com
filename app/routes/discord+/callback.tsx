import { type LoaderFunctionArgs, defer, redirect } from '@remix-run/node'
import { Await, Link, useAsyncError, useLoaderData } from '@remix-run/react'
import React, { Suspense } from 'react'
import { ArrowLink } from '#app/components/arrow-button.tsx'
import { ErrorPanel } from '#app/components/form-elements.tsx'
import { PartyIcon, RefreshIcon } from '#app/components/icons.tsx'
import { externalLinks } from '#app/external-links.tsx'
import { tagKCDSiteSubscriber } from '#app/kit/kit.server.ts'
import { type KCDHandle } from '#app/types.ts'
import { ensurePrimary } from '#app/utils/litefs-js.server.ts'
import { connectDiscord } from '#app/utils/discord.server.ts'
import {
	getDiscordAuthorizeURL,
	getDomainUrl,
	getErrorMessage,
	isResponse,
} from '#app/utils/misc.tsx'
import { requireUser } from '#app/utils/session.server.ts'
import { useRootData } from '#app/utils/use-root-data.ts'
import { deleteDiscordCache } from '#app/utils/user-info.server.ts'

export const handle: KCDHandle = {
	getSitemapEntries: () => null,
}

export async function loader({ request }: LoaderFunctionArgs) {
	await ensurePrimary()
	const user = await requireUser(request)
	const domainUrl = getDomainUrl(request)
	const code = new URL(request.url).searchParams.get('code')

	const url = new URL(domainUrl)
	url.pathname = '/me'

	try {
		if (!code) {
			throw redirect('/discord', { headers: { 'x-reason': 'no-code' } })
		}
		const discordMemberPromise = connectDiscord({ user, code, domainUrl }).then(
			(discordMember) => {
				void tagKCDSiteSubscriber({
					email: user.email,
					firstName: user.firstName,
					fields: {
						kcd_site_id: user.id,
						kcd_team: user.team,
						discord_user_id: discordMember.user.id,
					},
				})
				void deleteDiscordCache(discordMember.user.id)
				return discordMember
			},
		)

		return defer({ discordMember: discordMemberPromise })
	} catch (error: unknown) {
		if (isResponse(error)) throw error
		console.error(error)

		return defer({ discordMember: Promise.reject(error) })
	}
}

export default function DiscordCallback() {
	const data = useLoaderData<typeof loader>()

	React.useEffect(() => {
		const newSearchParams = new URLSearchParams(window.location.search)
		newSearchParams.delete('code')
		window.history.replaceState(
			null,
			'',
			[window.location.pathname, newSearchParams.toString()]
				.filter(Boolean)
				.join('?'),
		)
	})

	return (
		<Suspense
			fallback={
				<div className="flex flex-wrap gap-2">
					<span className="animate-reverse-spin">
						<RefreshIcon />
					</span>
					<p className="animate-pulse">Connecting your account to discord...</p>
				</div>
			}
		>
			<Await
				resolve={data.discordMember}
				errorElement={<DiscordConnectionError />}
			>
				{(discordMember) => (
					<div className="flex flex-wrap gap-1">
						<span className="text-team-current">
							<PartyIcon />
						</span>
						<span className="text-team-current">
							{discordMember.user.username}
						</span>
						{` has been connected to `}
						<span>
							<Link to="/me" className="text-team-current underline">
								your account
							</Link>
							!
						</span>
						<div className="my-6">
							<ArrowLink href="https://kcd.im/discord">
								Start chatting...
							</ArrowLink>
						</div>
					</div>
				)}
			</Await>
		</Suspense>
	)
}

function DiscordConnectionError() {
	const error = useAsyncError()
	const { requestInfo, user } = useRootData()
	const authorizeURL = user
		? getDiscordAuthorizeURL(requestInfo.origin)
		: externalLinks.discord

	return (
		<ErrorPanel>
			<div>Whoops! Sorry, there was an error 😬</div>
			<hr className="my-2" />
			<pre className="whitespace-pre-wrap">{getErrorMessage(error)}</pre>
			<hr className="my-2" />
			<a href={authorizeURL} className="underline">
				Try again?
			</a>
		</ErrorPanel>
	)
}
