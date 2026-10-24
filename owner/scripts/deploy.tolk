import "@acton/io"
import "@acton/emulation/network"
import "@acton/emulation/scripts"
import "@contracts/types"
import "@wrappers/Owner.gen"

fun main() {
    val deployer = scripts.wallet("deployer");

    val owner = Owner.fromStorage({
        owner: deployer.address,
        title: "Owner Smart Deal v.1",
        text: "This Owner holds administrative control over project contracts.",
    });
    // 5 Gram: the same amount the app attaches. Part is spent on fees; the rest stays on the contract.
    val res = owner.deploy(deployer.address, { value: ton("5") });
    println(res.waitForTrace());

    println("Deployed Owner to {}", owner.address);
    println("Controller is {}", owner.owner());
    println("Title is {}", owner.title());
    println("Text is {}", owner.text());
}
