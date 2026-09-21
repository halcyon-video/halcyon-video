import { dataRoot, pages, search } from '../../../catalog/load';
export function getStaticPaths() {
  return [...pages.map(page => ({ file: `page-${page.page}`, body: page })), { file: 'search', body: search }].map(({file, body}) => ({ params: { version: dataRoot.split('/').pop(), file }, props: { body } }));
}
export function GET({ props }: { props: { body: unknown } }) { return new Response(JSON.stringify(props.body)); }
