import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"

import "@contracts/types"
import "@wrappers/Owner.gen"

const PAY_FEES_SEPARATELY = SEND_MODE_PAY_FEES_SEPARATELY as uint8

get fun `test deploy stores controller title and text`() {
    val (contract, deployer, _) = setupTest();

    expect(contract.owner()).toEqual(deployer.address);
    expect(contract.title()).toEqual("Owner Smart Deal v.1");
    expect(contract.text()).toEqual("This Owner holds administrative control.");
}

get fun `test owner can transfer control and the previous wallet loses it`() {
    val (contract, deployer, nextOwner) = setupTest();

    val transferred = contract.sendTransferOwner(
        deployer.address,
        1,
        nextOwner.address,
        { value: ton("0.05") },
    );
    expect(transferred).toHaveSuccessfulTx<TransferOwner>({
        from: deployer.address,
        to: contract.address,
    });
    expect(contract.owner()).toEqual(nextOwner.address);

    val rejected = contract.sendUpdateDetails(
        deployer.address,
        2,
        "Stolen",
        "no",
        { value: ton("0.05") },
    );
    expect(rejected).toHaveFailedTx<UpdateDetails>({
        from: deployer.address,
        to: contract.address,
        exitCode: Errors.NotOwner,
    });
    expect(contract.title()).toEqual("Owner Smart Deal v.1");

    val updated = contract.sendUpdateDetails(
        nextOwner.address,
        3,
        "Handed off",
        "New controller",
        { value: ton("0.05") },
    );
    expect(updated).toHaveSuccessfulTx<UpdateDetails>({
        from: nextOwner.address,
        to: contract.address,
    });
    expect(contract.title()).toEqual("Handed off");
    expect(contract.text()).toEqual("New controller");
}

get fun `test transfer to this contract is rejected`() {
    val (contract, deployer, _) = setupTest();

    val res = contract.sendTransferOwner(
        deployer.address,
        0,
        contract.address,
        { value: ton("0.05") },
    );
    expect(res).toHaveFailedTx<TransferOwner>({
        from: deployer.address,
        to: contract.address,
        exitCode: Errors.InvalidMessage,
    });
    expect(contract.owner()).toEqual(deployer.address);
}

get fun `test stranger cannot transfer update or send`() {
    val (contract, deployer, stranger) = setupTest();
    val recipient = testing.treasury("stranger-recipient");

    val transfer = contract.sendTransferOwner(
        stranger.address,
        0,
        stranger.address,
        { value: ton("0.05") },
    );
    expect(transfer).toHaveFailedTx<TransferOwner>({
        from: stranger.address,
        to: contract.address,
        exitCode: Errors.NotOwner,
    });

    val update = contract.sendUpdateDetails(
        stranger.address,
        0,
        "Nope",
        "",
        { value: ton("0.05") },
    );
    expect(update).toHaveFailedTx<UpdateDetails>({
        from: stranger.address,
        to: contract.address,
        exitCode: Errors.NotOwner,
    });

    val send = contract.sendSendFromOwner(
        stranger.address,
        0,
        recipient.address,
        ton("0.1"),
        false,
        PAY_FEES_SEPARATELY,
        createEmptyCell(),
        { value: ton("0.05") },
    );
    expect(send).toHaveFailedTx<SendFromOwner>({
        from: stranger.address,
        to: contract.address,
        exitCode: Errors.NotOwner,
    });
    expect(contract.owner()).toEqual(deployer.address);
}

get fun `test plain transfer and text comment fund the contract`() {
    val (contract, deployer, stranger) = setupTest();

    val plain = contract.sendAny(stranger.address, createEmptyCell(), { value: ton("0.2") });
    expect(plain).toHaveSuccessfulTx({
        from: stranger.address,
        to: contract.address,
    });

    val comment = contract.sendAny(
        stranger.address,
        beginCell().storeUint(0, 32).storeUint(1, 8).endCell(),
        { value: ton("0.2") },
    );
    expect(comment).toHaveSuccessfulTx({
        from: stranger.address,
        to: contract.address,
    });
    expect(contract.owner()).toEqual(deployer.address);
    expect(contract.title()).toEqual("Owner Smart Deal v.1");
}

get fun `test unknown message is kept like a wallet deposit`() {
    val (contract, _, stranger) = setupTest();

    val res = contract.sendAny(
        stranger.address,
        beginCell().storeUint(0x999, 32).endCell(),
        { value: ton("0.2") },
    );
    expect(res).toHaveSuccessfulTx({
        from: stranger.address,
        to: contract.address,
    });
    expect(contract.title()).toEqual("Owner Smart Deal v.1");
}

get fun `test owner can send ton and a bounced send does not change the controller`() {
    val (contract, deployer, _) = setupTest();
    val recipient = testing.treasury("recipient");

    val sent = contract.sendSendFromOwner(
        deployer.address,
        4,
        recipient.address,
        ton("0.3"),
        false,
        PAY_FEES_SEPARATELY,
        createEmptyCell(),
        { value: ton("0.05") },
    );
    expect(sent).toHaveSuccessfulTx<SendFromOwner>({
        from: deployer.address,
        to: contract.address,
    });
    expect(sent).toHaveSuccessfulTx({
        from: contract.address,
        to: recipient.address,
        value: ton("0.3"),
    });

    val missing = address.fromWorkchainAndHash(0, 1);
    val bounced = contract.sendSendFromOwner(
        deployer.address,
        5,
        missing,
        ton("0.1"),
        true,
        PAY_FEES_SEPARATELY,
        createEmptyCell(),
        { value: ton("0.05") },
    );
    expect(bounced).toHaveSuccessfulTx<SendFromOwner>({
        from: deployer.address,
        to: contract.address,
    });
    expect(bounced).toHaveTx({
        to: contract.address,
        bounced: true,
    });
    expect(contract.owner()).toEqual(deployer.address);
}

get fun `test send forwards its body so this owner can administer another contract`() {
    val (parent, controller, nextOwner) = setupTest();
    val child = Owner.fromStorage({
        owner: parent.address,
        title: "Child",
        text: "",
    });
    val deployed = child.deploy(controller.address, { value: ton("0.5") });
    expect(deployed).toHaveSuccessfulDeploy({ to: child.address });
    expect(child.owner()).toEqual(parent.address);

    val body = TransferOwner {
        queryId: 1,
        newOwner: nextOwner.address,
    }.toCell();
    val res = parent.sendSendFromOwner(
        controller.address,
        7,
        child.address,
        ton("0.1"),
        true,
        PAY_FEES_SEPARATELY,
        body,
        { value: ton("0.05") },
    );
    expect(res).toHaveSuccessfulTx<SendFromOwner>({
        from: controller.address,
        to: parent.address,
    });
    expect(res).toHaveSuccessfulTx<TransferOwner>({
        from: parent.address,
        to: child.address,
    });
    expect(child.owner()).toEqual(nextOwner.address);
    expect(parent.owner()).toEqual(controller.address);
}

get fun `test send rejects a zero amount an illegal mode and an unaffordable amount`() {
    val (contract, deployer, _) = setupTest();
    val recipient = testing.treasury("fee-recipient");

    val zero = contract.sendSendFromOwner(
        deployer.address,
        0,
        recipient.address,
        0,
        false,
        PAY_FEES_SEPARATELY,
        createEmptyCell(),
        { value: ton("0.05") },
    );
    expect(zero).toHaveFailedTx<SendFromOwner>({
        from: deployer.address,
        to: contract.address,
        exitCode: Errors.InvalidMessage,
    });

    val destroyMode = contract.sendSendFromOwner(
        deployer.address,
        0,
        recipient.address,
        ton("0.1"),
        false,
        SEND_MODE_DESTROY as uint8,
        createEmptyCell(),
        { value: ton("0.05") },
    );
    expect(destroyMode).toHaveFailedTx<SendFromOwner>({
        from: deployer.address,
        to: contract.address,
        exitCode: Errors.InvalidMessage,
    });

    val poor = Owner.fromStorage({
        owner: deployer.address,
        title: "Poor",
        text: "",
    });
    val deployed = poor.deploy(deployer.address, { value: ton("0.08") });
    expect(deployed).toHaveSuccessfulDeploy({ to: poor.address });

    // Incoming value is part of the balance, so the requested amount must exceed deploy + message.
    val tooMuch = poor.sendSendFromOwner(
        deployer.address,
        0,
        recipient.address,
        ton("1"),
        false,
        PAY_FEES_SEPARATELY,
        createEmptyCell(),
        { value: ton("0.05") },
    );
    expect(tooMuch).toHaveFailedTx<SendFromOwner>({
        from: deployer.address,
        to: poor.address,
        exitCode: Errors.NotEnoughBalance,
    });
}

fun setupTest(): (Owner, Treasury, Treasury) {
    val deployer = testing.treasury("deployer");
    val notDeployer = testing.treasury("notDeployer");

    val contract = Owner.fromStorage({
        owner: deployer.address,
        title: "Owner Smart Deal v.1",
        text: "This Owner holds administrative control.",
    });
    val res = contract.deploy(deployer.address, { value: ton("1") });
    expect(res).toHaveSuccessfulDeploy({
        to: contract.address,
    });

    return (contract, deployer, notDeployer);
}
