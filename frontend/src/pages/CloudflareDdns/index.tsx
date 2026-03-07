import { HasPermission } from "src/components";
import { ADMIN, VIEW } from "src/modules/Permissions";
import TableWrapper from "./TableWrapper";

const CloudflareDdns = () => {
	return (
		<HasPermission section={ADMIN} permission={VIEW} pageLoading loadingNoLogo>
			<TableWrapper />
		</HasPermission>
	);
};

export default CloudflareDdns;
