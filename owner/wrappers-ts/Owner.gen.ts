// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a Owner contract in Tolk.
/* eslint-disable */

import * as c from '@ton/core';
import { beginCell, ContractProvider, Sender, SendMode } from '@ton/core';

// ————————————————————————————————————————————
//   predefined types and functions
//

type StoreCallback<T> = (obj: T, b: c.Builder) => void
type LoadCallback<T> = (s: c.Slice) => T

export type CellRef<T> = {
    ref: T
}

function makeCellFrom<T>(self: T, storeFn_T: StoreCallback<T>): c.Cell {
    let b = beginCell();
    storeFn_T(self, b);
    return b.endCell();
}

function loadAndCheckPrefix32(s: c.Slice, expected: number, structName: string): void {
    let prefix = s.loadUint(32);
    if (prefix !== expected) {
        throw new Error(`Incorrect prefix for '${structName}': expected 0x${expected.toString(16).padStart(8, '0')}, got 0x${prefix.toString(16).padStart(8, '0')}`);
    }
}

function lookupPrefix(s: c.Slice, expected: number, prefixLen: number): boolean {
    return s.remainingBits >= prefixLen && s.preloadUint(prefixLen) === expected;
}

function throwNonePrefixMatch(fieldPath: string): never {
    throw new Error(`Incorrect prefix for '${fieldPath}': none of variants matched`);
}

function storeCellRef<T>(cell: CellRef<T>, b: c.Builder, storeFn_T: StoreCallback<T>): void {
    let b_ref = c.beginCell();
    storeFn_T(cell.ref, b_ref);
    b.storeRef(b_ref.endCell());
}

function loadCellRef<T>(s: c.Slice, loadFn_T: LoadCallback<T>): CellRef<T> {
    let s_ref = s.loadRef().beginParse();
    return { ref: loadFn_T(s_ref) };
}

function storeTolkNullable<T>(v: T | null, b: c.Builder, storeFn_T: StoreCallback<T>): void {
    if (v === null) {
        b.storeUint(0, 1);
    } else {
        b.storeUint(1, 1);
        storeFn_T(v, b);
    }
}

// ————————————————————————————————————————————
//   parse get methods result from a TVM stack
//

class StackReader {
    constructor(private tuple: c.TupleItem[]) {
    }

    static fromGetMethod(expectedN: number, getMethodResult: { stack: c.TupleReader }): StackReader {
        let tuple = [] as c.TupleItem[];
        while (getMethodResult.stack.remaining) {
            tuple.push(getMethodResult.stack.pop());
        }
        if (tuple.length !== expectedN) {
            throw new Error(`expected ${expectedN} stack width, got ${tuple.length}`);
        }
        return new StackReader(tuple);
    }

    private popExpecting<ItemT>(itemType: string): ItemT {
        const item = this.tuple.shift();
        if (item?.type === itemType) {
            return item as ItemT;
        }
        throw new Error(`not '${itemType}' on a stack`);
    }

    private popCellLike(): c.Cell {
        const item = this.tuple.shift();
        if (item && (item.type === 'cell' || item.type === 'slice' || item.type === 'builder')) {
            return item.cell;
        }
        throw new Error(`not cell/slice on a stack`);
    }

    readBigInt(): bigint {
        return this.popExpecting<c.TupleItemInt>('int').value;
    }

    readBoolean(): boolean {
        return this.popExpecting<c.TupleItemInt>('int').value !== 0n;
    }

    readCell(): c.Cell {
        return this.popCellLike();
    }

    readSlice(): c.Slice {
        return this.popCellLike().beginParse();
    }

    readSnakeString(): string {
        return this.readCell().beginParse().loadStringTail();
    }
}

// ————————————————————————————————————————————
//   auto-generated serializers to/from cells
//

type coins = bigint

type uint8 = bigint
type uint64 = bigint

/**
 > struct Storage {
 >     owner: address
 >     title: string
 >     text: string
 > }
 */
export interface Storage {
    readonly $: 'Storage'
    owner: c.Address
    title: string
    text: string
}

export const Storage = {
    create(args: {
        owner: c.Address
        title: string
        text: string
    }): Storage {
        return {
            $: 'Storage',
            ...args
        }
    },
    fromSlice(s: c.Slice): Storage {
        return {
            $: 'Storage',
            owner: s.loadAddress(),
            title: s.loadStringRefTail(),
            text: s.loadStringRefTail(),
        }
    },
    store(self: Storage, b: c.Builder): void {
        b.storeAddress(self.owner);
        b.storeStringRefTail(self.title);
        b.storeStringRefTail(self.text);
    },
    toCell(self: Storage): c.Cell {
        return makeCellFrom<Storage>(self, Storage.store);
    }
}

/**
 > struct (0x4f574e01) TransferOwner {
 >     queryId: uint64
 >     newOwner: address
 > }
 */
export interface TransferOwner {
    readonly $: 'TransferOwner'
    queryId: uint64
    newOwner: c.Address
}

export const TransferOwner = {
    PREFIX: 0x4f574e01,

    create(args: {
        queryId: uint64
        newOwner: c.Address
    }): TransferOwner {
        return {
            $: 'TransferOwner',
            ...args
        }
    },
    fromSlice(s: c.Slice): TransferOwner {
        loadAndCheckPrefix32(s, 0x4f574e01, 'TransferOwner');
        return {
            $: 'TransferOwner',
            queryId: s.loadUintBig(64),
            newOwner: s.loadAddress(),
        }
    },
    store(self: TransferOwner, b: c.Builder): void {
        b.storeUint(0x4f574e01, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.newOwner);
    },
    toCell(self: TransferOwner): c.Cell {
        return makeCellFrom<TransferOwner>(self, TransferOwner.store);
    }
}

/**
 > struct (0x4f574e02) UpdateDetails {
 >     queryId: uint64
 >     title: string
 >     text: string
 > }
 */
export interface UpdateDetails {
    readonly $: 'UpdateDetails'
    queryId: uint64
    title: string
    text: string
}

export const UpdateDetails = {
    PREFIX: 0x4f574e02,

    create(args: {
        queryId: uint64
        title: string
        text: string
    }): UpdateDetails {
        return {
            $: 'UpdateDetails',
            ...args
        }
    },
    fromSlice(s: c.Slice): UpdateDetails {
        loadAndCheckPrefix32(s, 0x4f574e02, 'UpdateDetails');
        return {
            $: 'UpdateDetails',
            queryId: s.loadUintBig(64),
            title: s.loadStringRefTail(),
            text: s.loadStringRefTail(),
        }
    },
    store(self: UpdateDetails, b: c.Builder): void {
        b.storeUint(0x4f574e02, 32);
        b.storeUint(self.queryId, 64);
        b.storeStringRefTail(self.title);
        b.storeStringRefTail(self.text);
    },
    toCell(self: UpdateDetails): c.Cell {
        return makeCellFrom<UpdateDetails>(self, UpdateDetails.store);
    }
}

/**
 > struct (0x4f574e03) SendFromOwner {
 >     queryId: uint64
 >     dest: address
 >     tonAmount: coins
 >     bounce: bool
 >     sendMode: uint8
 >     body: cell
 > }
 */
export interface SendFromOwner {
    readonly $: 'SendFromOwner'
    queryId: uint64
    dest: c.Address
    tonAmount: coins
    bounce: boolean
    sendMode: uint8
    body: c.Cell
}

export const SendFromOwner = {
    PREFIX: 0x4f574e03,

    create(args: {
        queryId: uint64
        dest: c.Address
        tonAmount: coins
        bounce: boolean
        sendMode: uint8
        body: c.Cell
    }): SendFromOwner {
        return {
            $: 'SendFromOwner',
            ...args
        }
    },
    fromSlice(s: c.Slice): SendFromOwner {
        loadAndCheckPrefix32(s, 0x4f574e03, 'SendFromOwner');
        return {
            $: 'SendFromOwner',
            queryId: s.loadUintBig(64),
            dest: s.loadAddress(),
            tonAmount: s.loadCoins(),
            bounce: s.loadBoolean(),
            sendMode: s.loadUintBig(8),
            body: s.loadRef(),
        }
    },
    store(self: SendFromOwner, b: c.Builder): void {
        b.storeUint(0x4f574e03, 32);
        b.storeUint(self.queryId, 64);
        b.storeAddress(self.dest);
        b.storeCoins(self.tonAmount);
        b.storeBit(self.bounce);
        b.storeUint(self.sendMode, 8);
        b.storeRef(self.body);
    },
    toCell(self: SendFromOwner): c.Cell {
        return makeCellFrom<SendFromOwner>(self, SendFromOwner.store);
    }
}

// ————————————————————————————————————————————
//    class Owner
//

interface ExtraSendOptions {
    bounce?: boolean                    // default: false
    sendMode?: SendMode                 // default: SendMode.PAY_GAS_SEPARATELY
    extraCurrencies?: c.ExtraCurrency   // default: empty dict
}

interface DeployedAddrOptions {
    workchain?: number                  // default: 0 (basechain)
    toShard?: { fixedPrefixLength: number; closeTo: c.Address }
    overrideContractCode?: c.Cell
}

function calculateDeployedAddress(code: c.Cell, data: c.Cell, options: DeployedAddrOptions): c.Address {
    const stateInitCell = beginCell().store(c.storeStateInit({
        code,
        data,
        splitDepth: options.toShard?.fixedPrefixLength,
        special: null,
        libraries: null,
    })).endCell();

    let addrHash = stateInitCell.hash();
    if (options.toShard) {
        const shardDepth = options.toShard.fixedPrefixLength;
        addrHash = beginCell()
            .storeBits(new c.BitString(options.toShard.closeTo.hash, 0, shardDepth))
            .storeBits(new c.BitString(stateInitCell.hash(), shardDepth, 256 - shardDepth))
            .endCell()
            .beginParse().loadBuffer(32);
    }

    return new c.Address(options.workchain ?? 0, addrHash);
}

export class Owner implements c.Contract {
    static CodeCell = c.Cell.fromBase64('te6ccgECDAEAAZIAART/APSkE/S88sgLAQIBYgIDAgLPBAUCA3kgCAkB9z4kZEw4CDHAJF/lyDXScEgwwDikX+YINcLH8AAwwDikTDg1ywierpwDI4j7UTQ+kj4kljHBfLgZAHTPzH6SDD4KCHHBfLQZsj6Us7J7VTg1ywierpwFI4b7UTQ+kgw+JIhxwXy4GQB1NdMAsj6UszMye1U4NcsInq6cByAGAfUNSCB/3yw8tBm+CdvECGDBrCZggr68IC88uBljhEjwgDy4GYjggr68ICgvPLgZeIBkXGRcOIk0McAjjc0yM+FgCTDAM8KAM+EQBP6UgH6As+BIsAClWwSc/oCngLAA5QBcfoClAHPhCDi4nDPC2XJAfsA4MjPhYAhwwCAHAD6OG+1E0PpIMPiSxwXy4GTTP/pI+gDSANMH10zwAeAwAGLPCgDPhEAU+lJY+gLPgSLAApVsEnP6Ap4CwAOUAXH6ApQBz4Qg4uJxzwtlEszJAfsAAgFYCgsAD6xU9qJoa6ZAAA+mO9qJofSQYQARp/naiaGoY66Z');

    static Errors = {
        'Errors.NotOwner': 100,
        'Errors.NotEnoughBalance': 101,
        'Errors.InvalidMessage': 102,
    }

    readonly address: c.Address
    readonly init: { code: c.Cell, data: c.Cell } | undefined

    protected constructor(address: c.Address, init?: { code: c.Cell, data: c.Cell }) {
        this.address = address;
        this.init = init;
    }

    static fromAddress(address: c.Address) {
        return new Owner(address);
    }

    static fromStorage(emptyStorage: {
        owner: c.Address
        title: string
        text: string
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? Owner.CodeCell,
            data: Storage.toCell(Storage.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new Owner(address, initialState);
    }

    static createCellOfTransferOwner(body: {
        queryId: uint64
        newOwner: c.Address
    }) {
        return TransferOwner.toCell(TransferOwner.create(body));
    }

    static createCellOfUpdateDetails(body: {
        queryId: uint64
        title: string
        text: string
    }) {
        return UpdateDetails.toCell(UpdateDetails.create(body));
    }

    static createCellOfSendFromOwner(body: {
        queryId: uint64
        dest: c.Address
        tonAmount: coins
        bounce: boolean
        sendMode: uint8
        body: c.Cell
    }) {
        return SendFromOwner.toCell(SendFromOwner.create(body));
    }

    async sendDeploy(provider: ContractProvider, via: Sender, msgValue: coins, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: c.Cell.EMPTY,
            ...extraOptions
        });
    }

    async sendTransferOwner(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        newOwner: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: TransferOwner.toCell(TransferOwner.create(body)),
            ...extraOptions
        });
    }

    async sendUpdateDetails(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        title: string
        text: string
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: UpdateDetails.toCell(UpdateDetails.create(body)),
            ...extraOptions
        });
    }

    async sendSendFromOwner(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        queryId: uint64
        dest: c.Address
        tonAmount: coins
        bounce: boolean
        sendMode: uint8
        body: c.Cell
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: SendFromOwner.toCell(SendFromOwner.create(body)),
            ...extraOptions
        });
    }

    async getOwner(provider: ContractProvider): Promise<c.Address> {
        const r = StackReader.fromGetMethod(1, await provider.get('owner', []));
        return r.readSlice().loadAddress();
    }

    async getTitle(provider: ContractProvider): Promise<string> {
        const r = StackReader.fromGetMethod(1, await provider.get('title', []));
        return r.readSnakeString();
    }

    async getText(provider: ContractProvider): Promise<string> {
        const r = StackReader.fromGetMethod(1, await provider.get('text', []));
        return r.readSnakeString();
    }
}
