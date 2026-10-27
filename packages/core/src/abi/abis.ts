// Curated human-readable ABIs used for high-confidence decoding. They are
// deliberately conservative: a selector that is not present here falls through
// to the target contract's verified ABI and then to public signature registries.

export const ERC20_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address owner) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function transferFrom(address from, address to, uint256 amount) returns (bool)",
    "function increaseAllowance(address spender, uint256 addedValue) returns (bool)",
    "function decreaseAllowance(address spender, uint256 subtractedValue) returns (bool)",
    "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
    "event Transfer(address indexed from, address indexed to, uint256 value)",
    "event Approval(address indexed owner, address indexed spender, uint256 value)",
];

export const ERC721_ABI = [
    "function approve(address to, uint256 tokenId)",
    "function getApproved(uint256 tokenId) view returns (address)",
    "function setApprovalForAll(address operator, bool approved)",
    "function isApprovedForAll(address owner, address operator) view returns (bool)",
    "function transferFrom(address from, address to, uint256 tokenId)",
    "function safeTransferFrom(address from, address to, uint256 tokenId)",
    "function safeTransferFrom(address from, address to, uint256 tokenId, bytes data)",
    "function ownerOf(uint256 tokenId) view returns (address)",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
    "event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)",
    "event ApprovalForAll(address indexed owner, address indexed operator, bool approved)",
];

export const ERC1155_ABI = [
    "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)",
    "function safeBatchTransferFrom(address from, address to, uint256[] ids, uint256[] amounts, bytes data)",
    "function setApprovalForAll(address operator, bool approved)",
    "function balanceOf(address account, uint256 id) view returns (uint256)",
    "function balanceOfBatch(address[] accounts, uint256[] ids) view returns (uint256[])",
    "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
    "event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)",
    "event ApprovalForAll(address indexed account, address indexed operator, bool approved)",
];

export const WETH_ABI = [
    ...ERC20_ABI,
    "function deposit() payable",
    "function withdraw(uint256 wad)",
    "event Deposit(address indexed dst, uint256 wad)",
    "event Withdrawal(address indexed src, uint256 wad)",
];

export const UNISWAP_V2_ROUTER_ABI = [
    "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[])",
    "function swapTokensForExactTokens(uint256 amountOut, uint256 amountInMax, address[] path, address to, uint256 deadline) returns (uint256[])",
    "function swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable returns (uint256[])",
    "function swapTokensForExactETH(uint256 amountOut, uint256 amountInMax, address[] path, address to, uint256 deadline) returns (uint256[])",
    "function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[])",
    "function swapETHForExactTokens(uint256 amountOut, address[] path, address to, uint256 deadline) payable returns (uint256[])",
    "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable",
    "function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)",
    "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",
];

export const UNISWAP_V3_ROUTER_ABI = [
    "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint256 sqrtPriceLimitX96)) payable returns (uint256 amountOut)",
    "function exactInput((bytes path, address recipient, uint256 amountIn, uint256 amountOutMinimum)) payable returns (uint256 amountOut)",
    "function exactOutputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountOut, uint256 amountInMaximum, uint256 sqrtPriceLimitX96)) payable returns (uint256 amountIn)",
    "function exactOutput((bytes path, address recipient, uint256 amountOut, uint256 amountInMaximum)) payable returns (uint256 amountIn)",
    "function multicall(bytes32 previousBlockhash, bytes[] data) payable returns (bytes[] results)",
    "function multicall(bytes[] data) payable returns (bytes[] results)",
    "function multicall(uint256 deadline, bytes[] data) payable returns (bytes[] results)",
    "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
];

export const UNIVERSAL_ROUTER_ABI = [
    "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable",
    "function execute(bytes commands, bytes[] inputs, uint256 deadline, address payer) payable",
];

export const PERMIT2_ABI = [
    "function approve(address token, address spender, uint160 amount, uint48 expiration)",
    "function permit(address owner, ((address token, uint160 amount, uint48 expiration, uint48 nonce) details, address spender, uint256 sigDeadline) permitSingle, bytes signature)",
    "function transferFrom(address from, address to, uint160 amount, address token)",
    "function allowance(address owner, address token, address spender) view returns (uint160 amount, uint256 expiration, uint48 nonce)",
    "event Approval(address indexed owner, address indexed token, address indexed spender, uint160 amount, uint48 expiration)",
];

export const MULTICALL3_ABI = [
    "function aggregate((address target, bytes callData)[] calls) payable returns (uint256 blockNumber, bytes[] returnData)",
    "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)",
    "function aggregate3Value((address target, bool allowFailure, uint256 value, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)",
    "function multicall(bytes[] data) payable returns (bytes[] results)",
];

export const AGGREGATOR_EVENT_ABI = [
    ...UNISWAP_V2_ROUTER_ABI,
    ...UNISWAP_V3_ROUTER_ABI,
    "event Deposit(address indexed dst, uint256 wad)",
    "event Withdrawal(address indexed src, uint256 wad)",
];
