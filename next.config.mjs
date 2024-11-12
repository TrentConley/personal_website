/** @type {import('next').NextConfig} */
const nextConfig = {
    async redirects() {
        return [
            {
                source: '/lunch',
                destination: 'https://www.sagedining.com/sites/ensworthschool/menu',
                permanent: true, // Use `false` if you want a temporary redirect (307)
            },
        ];
    },
};

export default nextConfig;
